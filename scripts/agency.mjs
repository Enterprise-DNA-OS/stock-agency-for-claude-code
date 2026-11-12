#!/usr/bin/env node
// The stock agency desk. Every slash command in .claude/commands runs one of these.
//   npm run agency -- <report> [--flags]          attention, catalogue, results, market, transfers, debtors, ... (see help)
//   npm run agency -- <action> <args> [--flags]   book, sell, pass, transfer, close, settle, receipt, ...
// Human tables by default, --json for machines. Names match exactly, then by fragment; ambiguous lists candidates and exits 1.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { table, heading, money } from './lib/format.mjs';
import { importAgrinous, toDate, cents } from './lib/import.mjs';

const BOOLEAN_FLAGS = ['json', 'apply', 'help', 'all', 'unpaid', 'upcoming', 'open', 'processor', 'not-gst', 'saleyard-only', 'no-gst', 'nait'];

export function parseArgs(args) {
  const flags = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq >= 0) flags[a.slice(2, eq).replaceAll('-', '_')] = a.slice(eq + 1);
    else if (BOOLEAN_FLAGS.includes(a.slice(2))) flags[a.slice(2).replaceAll('-', '_')] = true;
    else if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) flags[a.slice(2).replaceAll('-', '_')] = args[++i];
    else throw Error(`Flag ${a} needs a value`);
  }
  return { flags, pos };
}

export class Ambiguous extends Error {}
const required = (v, what) => { if (v === undefined || v === null || String(v).trim() === '') throw Error(`Required: ${what}`); return String(v).trim(); };
const today = async (db) => (await db.query('select agency_today()::text d'))[0].d;
const settingsOf = async (db) => (await db.query('select * from settings'))[0];
const day = (v, what) => toDate(v, 'dmy', what);
const $ = (c) => (c === null || c === undefined ? '' : (Number(c) / 100).toFixed(2));
const num = (v, what) => { const n = Number(required(v, what)); if (!Number.isFinite(n) || n <= 0) throw Error(`${what} must be a positive number`); return n; };

// Resolve a record by exact name (or number), then by fragment. Ambiguous: list and exit 1.
export async function resolve(db, kind, term) {
  const spec = {
    client: ['clients', 'name'], agent: ['agents', 'name'], sale: ['sales', 'name'], consignment: ['consignments', 'ref'],
    'account-sale': ['account_sales', 'number'], invoice: ['buyer_invoices', 'number'], rate: ['charge_rates', 'code'],
  }[kind];
  const [t, col] = spec;
  const q = required(term, kind);
  let rows = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)
    ? await db.query(`select * from ${t} where id = $1::uuid`, [q])
    : await db.query(`select * from ${t} where lower(${col}) = lower($1)`, [q]);
  if (!rows.length && kind === 'client') rows = await db.query('select c.* from clients c join properties p on p.client_id = c.id where upper(p.pic) = upper($1)', [q]);
  if (!rows.length && /^[0-9a-f]{6,}$/i.test(q)) rows = await db.query(`select * from ${t} where id::text like $1`, [`${q.toLowerCase()}%`]);
  if (!rows.length && kind === 'sale' && /^\d{4}-\d{2}-\d{2}$/.test(q)) rows = await db.query('select * from sales where sale_date = $1 order by name', [q]);
  if (!rows.length) rows = await db.query(`select * from ${t} where ${col} ilike $1 order by ${col}`, [`%${q}%`]);
  if (kind === 'sale' && rows.length > 1) {
    // "Armidale Prime" means the nearest one of that series: the latest held, else the next one coming.
    const base = (r) => r.name.replace(/\s*\d{4}-\d{2}-\d{2}$/, '').toLowerCase();
    if (rows.every((r) => base(r) === base(rows[0]))) {
      const t0 = await today(db);
      const past = rows.filter((r) => String(r.sale_date) <= t0).sort((a, b) => String(b.sale_date).localeCompare(String(a.sale_date)));
      const future = rows.filter((r) => String(r.sale_date) > t0).sort((a, b) => String(a.sale_date).localeCompare(String(b.sale_date)));
      return past[0] || future[0];
    }
  }
  if (!rows.length) throw Error(`No ${kind} matches "${q}"`);
  if (rows.length > 1) throw new Ambiguous(`"${q}" matches ${rows.length} ${kind} records: ${rows.slice(0, 12).map((r) => r[col]).join(', ')}. Say which one.`);
  return rows[0];
}

async function lotOf(db, saleTerm, lotNo) {
  const sale = await resolve(db, 'sale', saleTerm);
  const lot = (await db.query('select * from lots where sale_id = $1 and lot_no = $2', [sale.id, required(lotNo, 'lot number')]))[0];
  if (!lot) throw Error(`${sale.name} has no lot ${lotNo}`);
  return { sale, lot };
}

async function audit(db, action, id, detail) {
  await db.query('insert into audit (action, record_id, detail) values ($1, $2, $3)', [action, id || null, JSON.stringify(detail)]);
}

const priceText = (r) => (r.price_cents === null || r.price_cents === undefined ? '' : r.basis === 'kg' ? `${Number(r.price_cents).toFixed(1)}c/kg` : `$${(Number(r.price_cents) / 100).toFixed(2)}/hd`);

// --------------------------------------------------------------- reports
// Each returns { title, rows, columns } or a list of them. --json prints the rows.

export const reports = {
  async attention(db) {
    const rows = await db.query('select reason, ref, client, detail from v_attention order by severity, reason, ref');
    return { title: `Needs attention (${rows.length})`, rows, columns: ['reason', 'ref', 'client', 'detail'] };
  },

  async compliance(db, f) {
    const rows = await db.query(`select rule, state, item, detail from v_compliance where state <> 'clean' or $1 order by case state when 'breached' then 0 when 'due' then 1 else 2 end, rule, item`, [Boolean(f.all)]);
    const clean = await db.query(`select rule, count(*) filter (where state = 'clean')::int as clean, count(*) filter (where state = 'due')::int as due, count(*) filter (where state = 'breached')::int as breached from v_compliance group by rule order by rule`);
    return [
      { title: `Compliance: ${rows.filter((r) => r.state !== 'clean').length} to act on (sources in docs/compliance.md)`, rows, columns: ['rule', 'state', 'item', 'detail'] },
      { title: 'By rule', rows: clean, columns: ['rule', 'clean', 'due', 'breached'] },
    ];
  },

  async sales(db, f) {
    const where = f.all ? 'true' : f.upcoming ? 's.sale_date >= agency_today()' : 's.sale_date >= agency_today() - 42';
    const rows = await db.query(`select s.name, s.sale_date, s.kind, s.species, s.status,
        count(l.id)::int as lots, coalesce(sum(l.head), 0)::int as head, count(l.id) filter (where l.status = 'sold')::int as sold,
        round(coalesce(sum(lv.gross_cents), 0) / 100.0, 2) as gross
      from sales s left join lots l on l.sale_id = s.id left join v_lots lv on lv.id = l.id
      where ${where} group by s.id order by s.sale_date desc, s.name`);
    return { title: `Sales (${rows.length})`, rows, columns: ['name', 'sale_date', 'kind', 'species', 'status', 'lots', 'head', 'sold', 'gross'] };
  },

  async sale(db, f, pos) {
    const s = await resolve(db, 'sale', pos[0]);
    const byVendor = await db.query(`select l.vendor, count(*)::int as lots, sum(l.head)::int as head, count(*) filter (where l.status = 'sold')::int as sold,
        round(coalesce(sum(l.gross_cents), 0) / 100.0, 2) as gross,
        round(coalesce((select sum(ch.amount_cents) from v_lot_charges ch where ch.sale_id = l.sale_id and ch.vendor_id = l.vendor_id), 0) / 100.0, 2) as charges_ex_gst
      from v_lots l where l.sale_id = $1 group by l.vendor, l.vendor_id, l.sale_id order by l.vendor`, [s.id]);
    const totals = (await db.query(`select count(*)::int as lots, coalesce(sum(head), 0)::int as head, count(*) filter (where status = 'sold')::int as sold,
        count(*) filter (where status = 'unsold')::int as unsold, count(*) filter (where status = 'passed_in')::int as passed_in, round(coalesce(sum(gross_cents), 0) / 100.0, 2) as gross
      from v_lots where sale_id = $1`, [s.id]));
    return [
      { title: `${s.name}: ${s.kind} ${s.species}, ${s.status}`, rows: totals, columns: ['lots', 'head', 'sold', 'unsold', 'passed_in', 'gross'] },
      { title: 'By vendor', rows: byVendor, columns: ['vendor', 'lots', 'head', 'sold', 'gross', 'charges_ex_gst'] },
    ];
  },

  async catalogue(db, f, pos) {
    const s = await resolve(db, 'sale', pos[0]);
    const rows = await db.query(`select l.lot_no as lot, c.ref as consignment, v.name as vendor, l.head, l.category, c.description, coalesce(c.nvd_number, 'NOT IN') as nvd,
        coalesce(c.treatment_note, '') as treatment, a.name as agent
      from lots l join consignments c on c.id = l.consignment_id join clients v on v.id = c.vendor_id left join agents a on a.id = c.agent_id
      where l.sale_id = $1 order by (case when l.lot_no ~ '^[0-9]+$' then l.lot_no::int end), l.lot_no`, [s.id]);
    return { title: `${s.name} catalogue (${rows.reduce((n, r) => n + Number(r.head), 0)} head)`, rows, columns: ['lot', 'consignment', 'vendor', 'head', 'category', 'description', 'nvd', 'treatment', 'agent'] };
  },

  async results(db, f, pos) {
    const s = await resolve(db, 'sale', pos[0]);
    const rows = (await db.query(`select lot_no as lot, vendor, head, category, avg_kg, basis, price_cents, status, coalesce(buyer, '') as buyer, coalesce(destination, '') as destination,
        round(per_head_cents / 100, 2) as per_head, round(gross_cents / 100.0, 2) as gross
      from v_lots where sale_id = $1 order by (case when lot_no ~ '^[0-9]+$' then lot_no::int end), lot_no`, [s.id])).map((r) => ({ ...r, price: priceText(r) }));
    return { title: `${s.name} results`, rows, columns: ['lot', 'vendor', 'head', 'category', 'avg_kg', 'price', 'per_head', 'gross', 'buyer', 'destination', 'status'] };
  },

  async market(db, f, pos) {
    const s = await resolve(db, 'sale', pos[0]);
    const rows = await db.query(`select category, lots, head, avg_kg, avg_c_per_kg, low_c_per_kg, top_c_per_kg, avg_dollars_per_head, top_dollars_per_head
      from v_market where sale_id = $1 order by head desc`, [s.id]);
    const prev = await db.query(`select m.category, m.avg_c_per_kg as last_c_per_kg, m.avg_dollars_per_head as last_per_head, m.sale_date as last_sale
      from v_market m join sales p on p.id = m.sale_id
      where p.sale_date < $1 and p.saleyard is not distinct from $2 and p.kind = $3 and p.species = $4
        and p.sale_date = (select max(p2.sale_date) from sales p2 join lots l2 on l2.sale_id = p2.id where p2.sale_date < $1 and p2.saleyard is not distinct from $2 and p2.kind = $3 and p2.species = $4 and l2.status = 'sold')`,
      [s.sale_date, s.saleyard, s.kind, s.species]);
    const last = new Map(prev.map((p) => [p.category, p]));
    for (const r of rows) {
      const p = last.get(r.category);
      r.change = !p ? 'new' : r.avg_c_per_kg !== null && p.last_c_per_kg !== null ? `${(Number(r.avg_c_per_kg) - Number(p.last_c_per_kg)).toFixed(1)}c/kg` : `$${(Number(r.avg_dollars_per_head) - Number(p.last_per_head)).toFixed(2)}/hd`;
    }
    return { title: `${s.name} market report (change on ${prev[0]?.last_sale ?? 'no earlier sale'})`, rows, columns: ['category', 'lots', 'head', 'avg_kg', 'avg_c_per_kg', 'low_c_per_kg', 'top_c_per_kg', 'avg_dollars_per_head', 'top_dollars_per_head', 'change'] };
  },

  async nvds(db, f) {
    const days = Number(f.days ?? 14);
    const rows = await db.query(`select s.sale_date, s.name as sale, c.ref, v.name as vendor, c.head_booked as head, c.description, coalesce(c.nvd_number, 'NOT IN') as nvd, c.nvd_received_on as received,
        coalesce(c.treatment_note, '') as treatment, coalesce(v.phone, '') as phone
      from consignments c join sales s on s.id = c.sale_id join clients v on v.id = c.vendor_id
      where s.status = 'booking' and s.sale_date between agency_today() and agency_today() + $1::int order by c.nvd_number is not null, s.sale_date, v.name`, [days]);
    return { title: `Vendor declarations for sales in the next ${days} days`, rows, columns: ['sale_date', 'sale', 'ref', 'vendor', 'head', 'description', 'nvd', 'received', 'treatment', 'phone'] };
  },

  async transfers(db, f) {
    const rows = await db.query(`select state, scheme, sale, lot_no as lot, head, category, vendor_pic as from_pic, coalesce(buyer_pic, '') as to_pic, buyer, due_on, transfer_done_on as done_on
      from v_transfers where ($1 or state in ('due', 'overdue')) order by case state when 'overdue' then 0 when 'due' then 1 else 2 end, due_on, sale, lot_no limit 300`, [Boolean(f.all)]);
    return { title: `Transfers ${f.all ? '(all)' : 'to record'} (${rows.length})`, rows, columns: ['state', 'scheme', 'sale', 'lot', 'head', 'category', 'from_pic', 'to_pic', 'buyer', 'due_on', 'done_on'] };
  },

  async 'account-sales'(db, f) {
    const params = [];
    const where = [];
    if (f.sale) { params.push((await resolve(db, 'sale', f.sale)).id); where.push(`a.sale_id = $${params.length}`); }
    if (f.vendor) { params.push((await resolve(db, 'client', f.vendor)).id); where.push(`a.vendor_id = $${params.length}`); }
    if (f.unpaid) where.push('a.paid_on is null');
    const rows = await db.query(`select a.number, s.sale_date, c.name as vendor, a.head, round(a.gross_cents / 100.0, 2) as gross, round(a.gst_cents / 100.0, 2) as gst,
        round(a.charges_cents / 100.0, 2) as charges, round(a.net_cents / 100.0, 2) as net, a.due_on, a.paid_on
      from account_sales a join sales s on s.id = a.sale_id join clients c on c.id = a.vendor_id
      ${where.length ? 'where ' + where.join(' and ') : ''} order by s.sale_date desc, a.number desc limit 200`, params);
    return { title: `Account sales (${rows.length})`, rows, columns: ['number', 'sale_date', 'vendor', 'head', 'gross', 'gst', 'charges', 'net', 'due_on', 'paid_on'] };
  },

  async 'account-sale'(db, f, pos) {
    const a = await resolve(db, 'account-sale', pos[0]);
    const head = await db.query(`select a.number, s.name as sale, c.name as vendor, a.head, round(a.gross_cents / 100.0, 2) as gross, round(a.gst_cents / 100.0, 2) as gst_on_stock,
        round(a.charges_cents / 100.0, 2) as charges, round(a.net_cents / 100.0, 2) as net, a.due_on, a.paid_on
      from account_sales a join sales s on s.id = a.sale_id join clients c on c.id = a.vendor_id where a.id = $1`, [a.id]);
    const lots = (await db.query(`select l.lot_no as lot, l.head, l.category, l.avg_kg, l.basis, l.price_cents, l.buyer, round(l.gross_cents / 100.0, 2) as gross
      from v_lots l where l.sale_id = $1 and l.vendor_id = $2 and l.status = 'sold' order by l.lot_no`, [a.sale_id, a.vendor_id])).map((r) => ({ ...r, price: priceText(r) }));
    const lines = await db.query(`select label, kind, sum(head)::int as head, round(sum(amount_cents) / 100.0, 2) as amount, round(sum(gst_cents) / 100.0, 2) as gst, coalesce(remit_to, '') as paid_to
      from account_sale_lines where account_sale_id = $1 group by label, kind, remit_to order by case kind when 'commission' then 0 when 'fee' then 1 else 2 end, label`, [a.id]);
    return [
      { title: `Account sale ${a.number}`, rows: head, columns: ['number', 'sale', 'vendor', 'head', 'gross', 'gst_on_stock', 'charges', 'net', 'due_on', 'paid_on'] },
      { title: 'Lots', rows: lots, columns: ['lot', 'head', 'category', 'avg_kg', 'price', 'buyer', 'gross'] },
      { title: 'Charges', rows: lines, columns: ['label', 'kind', 'head', 'amount', 'gst', 'paid_to'] },
    ];
  },

  async settlements(db) {
    const rows = await db.query(`select number, sale, vendor, head, round(net_cents / 100.0, 2) as net, due_on, days_late
      from v_settlements where paid_on is null order by due_on, vendor`);
    return { title: `Vendor proceeds to pay (${rows.length})`, rows, columns: ['number', 'sale', 'vendor', 'head', 'net', 'due_on', 'days_late'] };
  },

  async debtors(db) {
    const rows = await db.query(`select buyer, round(owing_cents / 100.0, 2) as owing, round(current_cents / 100.0, 2) as current, round(overdue_1_14_cents / 100.0, 2) as "1_14_days",
        round(overdue_15_30_cents / 100.0, 2) as "15_30_days", round(overdue_30_plus_cents / 100.0, 2) as "30_plus", round(credit_limit_cents / 100.0, 2) as "limit",
        coalesce(insured_until::text, '') as insured_until, case when on_stop then 'ON STOP' else '' end as stop
      from v_debtors order by overdue_30_plus_cents + overdue_15_30_cents + overdue_1_14_cents desc, owing_cents desc`);
    return { title: `Buyers owing (${rows.length})`, rows, columns: ['buyer', 'owing', 'current', '1_14_days', '15_30_days', '30_plus', 'limit', 'insured_until', 'stop'] };
  },

  async invoices(db, f) {
    const params = [];
    const where = [];
    if (f.buyer) { params.push((await resolve(db, 'client', f.buyer)).id); where.push(`buyer_id = $${params.length}`); }
    if (f.sale) { params.push((await resolve(db, 'sale', f.sale)).id); where.push(`sale_id = $${params.length}`); }
    if (f.unpaid) where.push('balance_cents > 0');
    const rows = await db.query(`select number, sale_date, buyer, head, round(total_cents / 100.0, 2) as total, round(paid_cents / 100.0, 2) as paid,
        round(balance_cents / 100.0, 2) as balance, due_on, days_overdue from v_invoices ${where.length ? 'where ' + where.join(' and ') : ''} order by sale_date desc, number desc limit 200`, params);
    return { title: `Buyer invoices (${rows.length})`, rows, columns: ['number', 'sale_date', 'buyer', 'head', 'total', 'paid', 'balance', 'due_on', 'days_overdue'] };
  },

  async clients(db, f) {
    const params = [];
    let where = 'c.active';
    if (f.kind) { params.push(f.kind); where += ` and (c.kind = $1 or c.kind = 'both')`; }
    const rows = await db.query(`select c.name, c.kind, coalesce(c.region, '') as region, coalesce(a.name, '') as agent,
        coalesce((select string_agg(p.pic, ' ') from properties p where p.client_id = c.id), '') as pics,
        (select max(s.sale_date) from consignments k join sales s on s.id = k.sale_id where k.vendor_id = c.id) as last_sold,
        (select max(l.sold_on) from lots l where l.buyer_id = c.id) as last_bought
      from clients c left join agents a on a.id = c.agent_id where ${where} order by c.name`, params);
    return { title: `Clients (${rows.length})`, rows, columns: ['name', 'kind', 'region', 'agent', 'pics', 'last_sold', 'last_bought'] };
  },

  async client(db, f, pos) {
    const c = await resolve(db, 'client', pos[0]);
    const profile = await db.query(`select c.name, c.kind, c.contact, c.phone, c.email, c.region, coalesce(a.name, '') as agent, c.tax_no, c.gst_registered,
        coalesce(c.commission_pct::text, 'default') as commission_pct, coalesce(c.terms_days::text, 'default') as terms_days,
        round(c.credit_limit_cents / 100.0, 2) as credit_limit, c.insured_until, c.on_stop, coalesce(c.notes, '') as notes
      from clients c left join agents a on a.id = c.agent_id where c.id = $1`, [c.id]);
    const props = await db.query('select pic, scheme, name, coalesce(state, \'\') as state, is_processor from properties where client_id = $1 order by pic', [c.id]);
    const sold = await db.query(`select s.sale_date, s.name as sale, sum(l.head)::int as head, string_agg(distinct l.category, ', ') as categories,
        round(sum(l.gross_cents) / 100.0, 2) as gross, round(sum(l.gross_cents)::numeric / nullif(sum(l.head), 0) / 100, 2) as per_head
      from v_lots l join sales s on s.id = l.sale_id where l.vendor_id = $1 and l.status = 'sold' group by s.id order by s.sale_date desc limit 12`, [c.id]);
    const bought = await db.query(`select l.sold_on, l.sale, sum(l.head)::int as head, string_agg(distinct l.category, ', ') as categories, round(sum(l.gross_cents) / 100.0, 2) as spend
      from v_lots l where l.buyer_id = $1 and l.status = 'sold' group by l.sold_on, l.sale order by l.sold_on desc limit 12`, [c.id]);
    const owing = await db.query(`select number, sale_date, round(balance_cents / 100.0, 2) as balance, due_on, days_overdue from v_invoices where buyer_id = $1 and balance_cents > 0 order by due_on`, [c.id]);
    const notes = await db.query('select happened_on, note from activity where client_id = $1 order by happened_on desc, created_at desc limit 8', [c.id]);
    return [
      { title: c.name, rows: profile, columns: Object.keys(profile[0]) },
      { title: 'Properties', rows: props, columns: ['pic', 'scheme', 'name', 'state', 'is_processor'] },
      { title: 'Sold through us', rows: sold, columns: ['sale_date', 'sale', 'head', 'categories', 'gross', 'per_head'] },
      { title: 'Bought through us', rows: bought, columns: ['sold_on', 'sale', 'head', 'categories', 'spend'] },
      { title: 'Owing', rows: owing, columns: ['number', 'sale_date', 'balance', 'due_on', 'days_overdue'] },
      { title: 'Notes', rows: notes, columns: ['happened_on', 'note'] },
    ];
  },

  async buyers(db, f) {
    const from = f.from ? day(f.from, '--from') : null;
    const params = [from];
    let cat = '';
    if (f.category) { params.push(`%${f.category}%`); cat = ` and l.category ilike $2`; }
    const rows = await db.query(`select l.buyer, count(*)::int as lots, sum(l.head)::int as head, round(sum(l.gross_cents) / 100.0, 2) as spend,
        round(sum(l.weight_kg * l.price_cents) filter (where l.basis = 'kg') / nullif(sum(l.weight_kg) filter (where l.basis = 'kg'), 0), 1) as avg_c_per_kg,
        round(sum(l.gross_cents)::numeric / sum(l.head) / 100, 2) as avg_per_head, max(l.sold_on) as last_bought
      from v_lots l where l.status = 'sold' and l.sold_on >= coalesce($1::date, agency_today() - 90)${cat} group by l.buyer order by sum(l.gross_cents) desc`, params);
    return { title: `Buyers since ${from ?? '90 days ago'}${f.category ? `, ${f.category}` : ''}`, rows, columns: ['buyer', 'lots', 'head', 'spend', 'avg_c_per_kg', 'avg_per_head', 'last_bought'] };
  },

  async vendors(db, f) {
    const from = f.from ? day(f.from, '--from') : null;
    const rows = await db.query(`select l.vendor, count(distinct l.sale_id)::int as sales, sum(l.head)::int as head, round(sum(l.gross_cents) / 100.0, 2) as gross,
        round(sum(l.gross_cents)::numeric / sum(l.head) / 100, 2) as avg_per_head, coalesce(max(l.agent), '') as agent, max(l.sale_date) as last_sold
      from v_lots l where l.status = 'sold' and l.sale_date >= coalesce($1::date, agency_today() - 90) group by l.vendor order by sum(l.gross_cents) desc`, [from]);
    return { title: `Vendors since ${from ?? '90 days ago'}`, rows, columns: ['vendor', 'sales', 'head', 'gross', 'avg_per_head', 'agent', 'last_sold'] };
  },

  async agents(db, f) {
    const from = f.from ? day(f.from, '--from') : null;
    const rows = await db.query(`select agent, count(distinct sale)::int as sales, sum(head)::int as head, round(sum(commission_cents) / 100.0, 2) as commission,
        round(sum(agent_share_cents) / 100.0, 2) as agent_share
      from v_agent_earnings where sale_date >= coalesce($1::date, date_trunc('month', agency_today())::date - interval '2 months') group by agent order by sum(commission_cents) desc`, [from]);
    return { title: `Commission by agent since ${from ?? 'the start of the month two months ago'}`, rows, columns: ['agent', 'sales', 'head', 'commission', 'agent_share'] };
  },

  async levies(db, f) {
    const rows = await db.query(`select to_char(v.month, 'YYYY-MM') as month, v.label, v.species, v.head, round(v.levy_cents / 100.0, 2) as levy,
        coalesce(r.lodged_on::text, 'not lodged') as lodged, coalesce(r.reference, '') as reference
      from v_levies v left join levy_returns r on r.month = v.month
      where ($1::text is null or to_char(v.month, 'YYYY-MM') = $1) order by v.month desc, v.label`, [f.month ?? null]);
    return { title: 'Transaction levies held, by month', rows, columns: ['month', 'label', 'species', 'head', 'levy', 'lodged', 'reference'] };
  },

  async rates(db) {
    const rows = await db.query(`select code, label, kind, basis, amount, coalesce(species, 'all') as species, coalesce(cap_cents_per_head::text, '') as cap_cents_per_head,
        coalesce(min_price_cents_per_head::text, '') as min_price_cents, saleyard_only, gst, coalesce(remit_to, '') as paid_to, active from charge_rates order by kind, code`);
    return { title: 'What comes off the vendor\'s cheque', rows, columns: ['code', 'label', 'kind', 'basis', 'amount', 'species', 'cap_cents_per_head', 'min_price_cents', 'saleyard_only', 'gst', 'paid_to', 'active'] };
  },

  async 'weekly-review'(db) {
    const att = await reports.attention(db);
    const coming = await db.query(`select s.sale_date, s.name, count(distinct c.id)::int as consignments, coalesce(sum(c.head_booked), 0)::int as head_booked,
        count(c.id) filter (where c.nvd_number is null)::int as nvds_missing
      from sales s left join consignments c on c.sale_id = s.id where s.status = 'booking' and s.sale_date between agency_today() and agency_today() + 14 group by s.id order by s.sale_date`);
    const week = await db.query(`select s.name, sum(l.head)::int as head, round(sum(l.gross_cents) / 100.0, 2) as gross, s.status
      from v_lots l join sales s on s.id = l.sale_id where l.status = 'sold' and s.sale_date between agency_today() - 7 and agency_today() group by s.id order by s.sale_date`);
    const money = await db.query(`select 'vendor proceeds unpaid' as what, count(*)::int as count, round(coalesce(sum(net_cents), 0) / 100.0, 2) as amount from v_settlements where paid_on is null
      union all select 'buyers overdue', count(*)::int, round(coalesce(sum(owing_cents - current_cents), 0) / 100.0, 2) from v_debtors where worst_days > 0`);
    const comp = await db.query(`select rule, count(*)::int as breached from v_compliance where state = 'breached' group by rule order by rule`);
    return [
      att,
      { title: 'Sales in the next 14 days', rows: coming, columns: ['sale_date', 'name', 'consignments', 'head_booked', 'nvds_missing'] },
      { title: 'Sold in the last 7 days', rows: week, columns: ['name', 'head', 'gross', 'status'] },
      { title: 'Money', rows: money, columns: ['what', 'count', 'amount'] },
      { title: 'Rules breached', rows: comp, columns: ['rule', 'breached'] },
    ];
  },
};

// --------------------------------------------------------------- actions

const SETTABLE = {
  client: { name: 'text', kind: 'text', contact: 'text', phone: 'text', email: 'text', address: 'text', region: 'text', tax_no: 'text', gst_registered: 'bool',
    commission_pct: 'num', terms_days: 'int', credit_limit: 'cents', insured_until: 'date', on_stop: 'bool', notes: 'text', active: 'bool', agent: 'agent' },
  agent: { name: 'text', branch: 'text', phone: 'text', email: 'text', commission_share_pct: 'num', active: 'bool' },
  sale: { name: 'text', sale_date: 'date', saleyard: 'text', kind: 'text', species: 'text', notes: 'text' },
  rate: { label: 'text', amount: 'num', species: 'text', cap_cents_per_head: 'num', min_price_cents_per_head: 'num', gst: 'bool', saleyard_only: 'bool', remit_to: 'text', active: 'bool' },
  settings: { business_name: 'text', agency_code: 'text', currency: 'text', country: 'text', gst_pct: 'num', commission_pct: 'num', vendor_settle_days: 'int',
    buyer_terms_days: 'int', transfer_days: 'int', nvd_to_buyer_days: 'int', quiet_after_days: 'int', as_of: 'date' },
};
const TABLE = { client: 'clients', agent: 'agents', sale: 'sales', rate: 'charge_rates', settings: 'settings' };

async function coerce(db, type, v, key) {
  if (v === '' || v === 'null' || v === 'none') return null;
  if (type === 'bool') return ['yes', 'true', '1', 'y', 'on'].includes(String(v).toLowerCase());
  if (type === 'num') { const n = Number(v); if (!Number.isFinite(n)) throw Error(`--${key} must be a number`); return n; }
  if (type === 'int') { const n = Number(v); if (!Number.isInteger(n)) throw Error(`--${key} must be a whole number`); return n; }
  if (type === 'cents') return cents(v);
  if (type === 'date') return day(v, `--${key}`);
  if (type === 'agent') return (await resolve(db, 'agent', v)).id;
  return String(v);
}

export const actions = {
  async add(db, f, pos) {
    const what = required(pos[0], 'what to add (client, property, agent, sale, rate)');
    if (what === 'client') {
      const r = (await db.query(`insert into clients (name, kind, region, contact, phone, email, tax_no, gst_registered, agent_id, commission_pct, terms_days, credit_limit_cents)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id, name`,
        [required(f.name, '--name'), f.kind || 'both', f.region || null, f.contact || null, f.phone || null, f.email || null, f.tax_no || null, !f.not_gst,
          f.agent ? (await resolve(db, 'agent', f.agent)).id : null, f.commission ? Number(f.commission) : null, f.terms ? Number(f.terms) : null, f.limit ? cents(f.limit) : null]))[0];
      if (f.pic) await db.query('insert into properties (client_id, name, pic, scheme, state, is_processor) values ($1, $2, $3, $4, $5, $6)',
        [r.id, f.property || `${r.name} property`, f.pic.toUpperCase(), f.nait ? 'NAIT' : 'NLIS', f.state || null, Boolean(f.processor)]);
      await audit(db, 'add client', r.id, f);
      return `Added client ${r.name}${f.pic ? ` with ${f.nait ? 'NAIT number' : 'PIC'} ${f.pic.toUpperCase()}` : ''}.`;
    }
    if (what === 'property') {
      const c = await resolve(db, 'client', pos[1]);
      await db.query('insert into properties (client_id, name, pic, scheme, state, is_processor) values ($1, $2, $3, $4, $5, $6)',
        [c.id, f.name || `${c.name} property`, required(f.pic, '--pic').toUpperCase(), f.nait ? 'NAIT' : 'NLIS', f.state || null, Boolean(f.processor)]);
      return `Added ${f.nait ? 'NAIT location' : 'PIC'} ${f.pic.toUpperCase()} to ${c.name}.`;
    }
    if (what === 'agent') {
      await db.query('insert into agents (name, branch, phone, email, commission_share_pct) values ($1, $2, $3, $4, $5)',
        [required(f.name, '--name'), f.branch || null, f.phone || null, f.email || null, f.share ? Number(f.share) : 50]);
      return `Added agent ${f.name}.`;
    }
    if (what === 'sale') {
      const date = day(required(f.date, '--date'), '--date');
      const name = f.name || `${f.saleyard || 'Sale'} ${date}`;
      await db.query('insert into sales (name, sale_date, saleyard, kind, species, notes) values ($1, $2, $3, $4, $5, $6)',
        [name, date, f.saleyard || null, f.kind || 'prime', f.species || 'cattle', f.notes || null]);
      return `Added sale ${name}, booking open.`;
    }
    if (what === 'rate') {
      await db.query(`insert into charge_rates (code, label, kind, basis, amount, species, cap_cents_per_head, min_price_cents_per_head, saleyard_only, gst, remit_to)
        values (upper($1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [required(f.code, '--code'), required(f.label, '--label'), required(f.kind, '--kind (commission, fee, levy)'), required(f.basis, '--basis (pct, per_head, per_lot)'),
          num(f.amount, '--amount'), f.species || null, f.cap ? Number(f.cap) : null, f.min_price ? Number(f.min_price) : null, Boolean(f.saleyard_only), !f.no_gst && f.kind !== 'levy', f.remit_to || null]);
      return `Added charge ${String(f.code).toUpperCase()}.`;
    }
    throw Error(`Cannot add "${what}". Use client, property, agent, sale or rate.`);
  },

  async set(db, f, pos) {
    const what = required(pos[0], 'what to set (client, agent, sale, rate, settings)');
    const fields = SETTABLE[what];
    if (!fields) throw Error(`Cannot set "${what}".`);
    const id = what === 'settings' ? 1 : (await resolve(db, what === 'rate' ? 'rate' : what, pos[1])).id;
    const sets = [], params = [];
    for (const [k, v] of Object.entries(f)) {
      if (k === 'json') continue;
      if (!fields[k]) throw Error(`Unknown field --${k.replaceAll('_', '-')} for ${what}. Settable: ${Object.keys(fields).join(', ')}`);
      const col = { credit_limit: 'credit_limit_cents', agent: 'agent_id' }[k] || k;
      params.push(await coerce(db, fields[k], v, k));
      sets.push(`${col} = $${params.length}`);
    }
    if (!sets.length) throw Error('Nothing to set. Pass --field=value.');
    params.push(id);
    await db.query(`update ${TABLE[what]} set ${sets.join(', ')} where id = $${params.length}`, params);
    await audit(db, `set ${what}`, typeof id === 'string' ? id : null, f);
    return `Updated ${what}${pos[1] ? ` ${pos[1]}` : ''}: ${Object.keys(f).filter((k) => k !== 'json').join(', ')}.`;
  },

  async book(db, f, pos) {
    const sale = await resolve(db, 'sale', pos[0]);
    if (sale.status === 'closed') throw Error(`${sale.name} is closed.`);
    const vendor = await resolve(db, 'client', pos[1]);
    const head = num(f.head, '--head');
    const species = f.species || (sale.species === 'sheep' ? 'lambs' : 'cattle');
    const prop = f.pic ? (await db.query('select id from properties where upper(pic) = upper($1) and client_id = $2', [f.pic, vendor.id]))[0]
      : (await db.query('select id from properties where client_id = $1 and active order by created_at limit 1', [vendor.id]))[0];
    if (f.pic && !prop) throw Error(`${vendor.name} has no property with PIC ${f.pic}. Add it first: add property "${vendor.name}" --pic=${f.pic}`);
    const agentId = f.agent ? (await resolve(db, 'agent', f.agent)).id : vendor.agent_id;
    const c = (await db.query(`insert into consignments (ref, sale_id, vendor_id, property_id, agent_id, species, description, head_booked, nvd_number, nvd_received_on, treatment_note)
      values ('C-' || nextval('consignment_ref_seq'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id, ref`,
      [sale.id, vendor.id, prop?.id || null, agentId, species, required(f.description, '--description'), head, f.nvd || null, f.nvd ? await today(db) : null, f.treatment || null]))[0];
    const next = (await db.query(`select coalesce(max(lot_no::int), 0) + 1 as n from lots where sale_id = $1 and lot_no ~ '^[0-9]+$'`, [sale.id]))[0].n;
    await db.query(`insert into lots (sale_id, consignment_id, lot_no, head, category, basis) values ($1, $2, $3, $4, $5, $6)`,
      [sale.id, c.id, f.lot || String(next), head, f.category || (species === 'lambs' ? 'lambs' : 'mixed'), f.basis || (['sheep', 'lambs', 'goats'].includes(species) ? 'head' : 'kg')]);
    await audit(db, 'book', c.id, { sale: sale.name, vendor: vendor.name, head });
    return `Booked ${c.ref}: ${head} head from ${vendor.name} into ${sale.name} as lot ${f.lot || next}.${f.nvd ? '' : ' NVD not in yet.'}${prop ? '' : ' No PIC on file for this vendor.'}`;
  },

  async nvd(db, f, pos) {
    const c = await resolve(db, 'consignment', pos[0]);
    await db.query('update consignments set nvd_number = $2, nvd_received_on = $3 where id = $1', [c.id, required(f.number, '--number'), f.on ? day(f.on, '--on') : await today(db)]);
    return `NVD ${f.number} recorded on ${c.ref}.`;
  },

  async split(db, f, pos) {
    const { sale, lot } = await lotOf(db, pos[0], pos[1]);
    const head = num(f.head, '--head');
    if (head >= lot.head) throw Error(`Lot ${lot.lot_no} has ${lot.head} head: split off fewer than that.`);
    if (lot.status !== 'unsold') throw Error(`Lot ${lot.lot_no} already has a result.`);
    const next = (await db.query(`select coalesce(max(lot_no::int), 0) + 1 as n from lots where sale_id = $1 and lot_no ~ '^[0-9]+$'`, [sale.id]))[0].n;
    await db.query('update lots set head = head - $2 where id = $1', [lot.id, head]);
    await db.query('insert into lots (sale_id, consignment_id, lot_no, head, category, basis) values ($1, $2, $3, $4, $5, $6)',
      [sale.id, lot.consignment_id, f.lot || String(next), head, f.category || lot.category, lot.basis]);
    return `Split ${head} head off lot ${lot.lot_no} into lot ${f.lot || next}.`;
  },

  async sell(db, f, pos) {
    const { sale, lot } = await lotOf(db, pos[0], pos[1]);
    if (sale.status === 'closed') throw Error(`${sale.name} is closed: its account sales are written.`);
    const buyer = await resolve(db, 'client', required(f.buyer, '--buyer'));
    const basis = f.basis || lot.basis;
    const head = f.head ? num(f.head, '--head') : lot.head;
    const weight = basis === 'kg' ? num(f.kg, '--kg (total live weight of the lot)') : (f.kg ? Number(f.kg) : null);
    // c/kg as cents per kg (402.5); $/hd as dollars per head (215.50).
    const price = basis === 'kg' ? num(f.price, '--price (cents per kg)') : Math.round(num(f.price, '--price (dollars per head)') * 100);
    if (basis === 'kg' && (price < 50 || price > 3000)) throw Error(`--price ${f.price} c/kg looks wrong: give cents per kilogram, for example 402.5`);
    const bprop = f.pic ? (await db.query('select * from properties where upper(pic) = upper($1)', [f.pic]))[0]
      : (await db.query('select * from properties where client_id = $1 and active order by created_at limit 1', [buyer.id]))[0];
    if (f.pic && !bprop) throw Error(`No property with PIC ${f.pic}.`);
    const destination = f.destination || (bprop?.is_processor ? 'slaughter' : 'restock');
    const soldOn = f.on ? day(f.on, '--on') : String(sale.sale_date) <= (await today(db)) ? String(sale.sale_date) : await today(db);
    await db.query(`update lots set status = 'sold', head = $2, basis = $3, weight_kg = $4, price_cents = $5, buyer_id = $6, buyer_property_id = $7, destination = $8, sold_on = $9 where id = $1`,
      [lot.id, head, basis, weight, price, buyer.id, bprop?.id || null, destination, soldOn]);
    await audit(db, 'sell', lot.id, { sale: sale.name, lot: lot.lot_no, buyer: buyer.name, price, weight });
    const gross = basis === 'kg' ? Math.round(weight * price) : head * price;
    const warn = [buyer.on_stop ? `WARNING: ${buyer.name} is on stop.` : '', bprop ? '' : `No PIC on file for ${buyer.name}: add one before the transfer.`].filter(Boolean).join(' ');
    return `Lot ${lot.lot_no}: ${head} head to ${buyer.name} at ${basis === 'kg' ? `${price}c/kg` : `$${(price / 100).toFixed(2)}/hd`}, ${money(gross, (await settingsOf(db)).currency)} gross (${destination}).${warn ? ' ' + warn : ''}`;
  },

  async pass(db, f, pos) {
    const { sale, lot } = await lotOf(db, pos[0], pos[1]);
    if (sale.status === 'closed') throw Error(`${sale.name} is closed.`);
    await db.query(`update lots set status = 'passed_in', buyer_id = null, price_cents = null, sold_on = null where id = $1`, [lot.id]);
    return `Lot ${lot.lot_no} passed in.`;
  },

  async withdraw(db, f, pos) {
    const { sale, lot } = await lotOf(db, pos[0], pos[1]);
    if (sale.status === 'closed') throw Error(`${sale.name} is closed.`);
    await db.query(`update lots set status = 'withdrawn', buyer_id = null, price_cents = null, sold_on = null where id = $1`, [lot.id]);
    return `Lot ${lot.lot_no} withdrawn.`;
  },

  async transfer(db, f, pos) {
    const sale = await resolve(db, 'sale', pos[0]);
    const on = f.on ? day(f.on, '--on') : await today(db);
    const rows = f.all
      ? await db.query(`update lots set transfer_done_on = $2, transfer_ref = coalesce($3, transfer_ref) where sale_id = $1 and status = 'sold' and transfer_done_on is null returning lot_no`, [sale.id, on, f.ref || null])
      : await db.query(`update lots set transfer_done_on = $2, transfer_ref = coalesce($4, transfer_ref) where sale_id = $1 and lot_no = $3 and status = 'sold' returning lot_no`, [sale.id, on, required(pos[1], 'lot number or --all'), f.ref || null]);
    if (!rows.length) throw Error(f.all ? `Nothing left to transfer in ${sale.name}.` : `${sale.name} has no sold lot ${pos[1]}.`);
    return `Transfer recorded on ${on} for ${rows.length} lot${rows.length === 1 ? '' : 's'} in ${sale.name}: ${rows.map((r) => r.lot_no).join(', ')}.`;
  },

  async 'nvd-sent'(db, f, pos) {
    const sale = await resolve(db, 'sale', pos[0]);
    const on = f.on ? day(f.on, '--on') : await today(db);
    const params = [sale.id, on];
    let where = `sale_id = $1 and status = 'sold' and nvd_sent_on is null`;
    if (f.buyer) { params.push((await resolve(db, 'client', f.buyer)).id); where += ` and buyer_id = $3`; }
    else if (!f.all) { params.push(required(pos[1], 'lot number, --buyer or --all')); where += ` and lot_no = $3`; }
    const rows = await db.query(`update lots set nvd_sent_on = $2 where ${where} returning lot_no`, params);
    if (!rows.length) throw Error('No matching lots are waiting on an NVD copy.');
    return `NVD copy sent ${on}: lots ${rows.map((r) => r.lot_no).join(', ')}.`;
  },

  async close(db, f, pos) {
    const sale = await resolve(db, 'sale', pos[0]);
    if (sale.status === 'closed') throw Error(`${sale.name} is already closed.`);
    const unsold = await db.query(`select lot_no from lots where sale_id = $1 and status = 'unsold' order by lot_no`, [sale.id]);
    if (unsold.length) throw Error(`${sale.name} has lots with no result: ${unsold.map((r) => r.lot_no).join(', ')}. Sell, pass or withdraw them first.`);
    const st = await settingsOf(db);
    const preview = await db.query(`select l.vendor, sum(l.head)::int as head, round(sum(l.gross_cents) / 100.0, 2) as gross,
        round(coalesce((select sum(ch.amount_cents + case when ch.gst then round(ch.amount_cents * $2::numeric / 100) else 0 end) from v_lot_charges ch where ch.sale_id = l.sale_id and ch.vendor_id = l.vendor_id), 0) / 100.0, 2) as charges
      from v_lots l where l.sale_id = $1 and l.status = 'sold' group by l.vendor, l.vendor_id, l.sale_id order by l.vendor`, [sale.id, st.gst_pct]);
    if (!f.apply) {
      return [{ title: `Test run: ${sale.name} would write ${preview.length} account sales (run again with --apply to write them)`, rows: preview, columns: ['vendor', 'head', 'gross', 'charges'] }];
    }
    await db.exec('BEGIN');
    try {
      await db.query('select close_sale($1)', [sale.id]);
      await audit(db, 'close sale', sale.id, { name: sale.name });
      await db.exec('COMMIT');
    } catch (e) {
      await db.exec('ROLLBACK');
      throw e;
    }
    const a = await db.query('select count(*)::int n, round(sum(net_cents) / 100.0, 2) as net from account_sales where sale_id = $1', [sale.id]);
    const i = await db.query('select count(*)::int n, round(sum(total_cents) / 100.0, 2) as total from buyer_invoices where sale_id = $1', [sale.id]);
    return `${sale.name} closed: ${a[0].n} account sales (${a[0].net} net to vendors) and ${i[0].n} buyer invoices (${i[0].total} incl. GST). Print them with npm run docs.`;
  },

  async settle(db, f, pos) {
    const a = await resolve(db, 'account-sale', pos[0]);
    if (a.paid_on) throw Error(`${a.number} was paid on ${a.paid_on}.`);
    await db.query('update account_sales set paid_on = $2, paid_ref = $3 where id = $1', [a.id, f.on ? day(f.on, '--on') : await today(db), f.ref || null]);
    await audit(db, 'settle', a.id, { number: a.number });
    return `${a.number} marked paid to the vendor: ${money(a.net_cents, (await settingsOf(db)).currency)}. This records a payment you made; it does not move money.`;
  },

  async receipt(db, f, pos) {
    const inv = await resolve(db, 'invoice', pos[0]);
    const bal = (await db.query('select balance_cents from v_invoices where id = $1', [inv.id]))[0].balance_cents;
    const amt = f.amount ? cents(f.amount) : Number(bal);
    if (!(amt > 0)) throw Error(`${inv.number} has nothing owing.`);
    if (amt > Number(bal)) throw Error(`${inv.number} has ${$(bal)} owing; ${$(amt)} is more than that.`);
    await db.query('insert into receipts (invoice_id, amount_cents, received_on, reference) values ($1, $2, $3, $4)', [inv.id, amt, f.on ? day(f.on, '--on') : await today(db), f.ref || null]);
    return `Received ${$(amt)} on ${inv.number}; ${$(Number(bal) - amt)} still owing.`;
  },

  async 'lodge-levy'(db, f) {
    const month = required(f.month, '--month=YYYY-MM');
    if (!/^\d{4}-\d{2}$/.test(month)) throw Error('--month must be YYYY-MM');
    const total = (await db.query(`select coalesce(sum(levy_cents), 0)::bigint as c from v_levies where to_char(month, 'YYYY-MM') = $1`, [month]))[0].c;
    await db.query(`insert into levy_returns (month, lodged_on, amount_cents, reference) values (($1 || '-01')::date, $2, $3, $4)
      on conflict (month) do update set lodged_on = excluded.lodged_on, amount_cents = excluded.amount_cents, reference = excluded.reference`,
      [month, f.on ? day(f.on, '--on') : await today(db), total, f.ref || null]);
    return `Levy return for ${month} recorded as lodged: ${$(total)}. This records what you lodged; it does not lodge it.`;
  },

  async log(db, f, pos) {
    const c = await resolve(db, 'client', pos[0]);
    const sale = f.sale ? (await resolve(db, 'sale', f.sale)).id : null;
    await db.query('insert into activity (client_id, sale_id, agent_id, note, happened_on) values ($1, $2, $3, $4, $5)',
      [c.id, sale, f.agent ? (await resolve(db, 'agent', f.agent)).id : c.agent_id, required(f.note, '--note'), f.on ? day(f.on, '--on') : await today(db)]);
    return `Noted on ${c.name}.`;
  },

  async import(db, f, pos) {
    if (pos[0] !== 'agrinous') throw Error('Usage: import agrinous <businesses.csv> [--lots=sale-lots.csv] [--date-order=dmy|mdy] [--open] [--apply]');
    const file = pos[1] && pos[1] !== '-' ? path.resolve(pos[1]) : null;
    if (!file && !f.lots) throw Error('Give a businesses CSV, a --lots CSV, or both.');
    const r = await importAgrinous(db, file, { lots: f.lots ? path.resolve(f.lots) : null, apply: Boolean(f.apply), dateOrder: f.date_order || 'dmy', open: Boolean(f.open) });
    const lines = [
      f.apply ? 'Imported.' : 'Test run: nothing written. Run again with --apply to write it.',
      `clients created: ${r.clients_created}, matched: ${r.clients_matched}, properties created: ${r.properties_created}`,
      `sales created: ${r.sales_created}, lots created: ${r.lots_created}, lots updated: ${r.lots_updated}`,
    ];
    if (r.unknown.length) lines.push(`Columns not used: ${r.unknown.join(', ')}`);
    if (r.skipped.length) lines.push(`Skipped ${r.skipped.length}:`, ...r.skipped.slice(0, 20).map((s) => `  ${s}`));
    return lines.join('\n');
  },

  async export(db, f) {
    const dir = path.resolve(f.dir || path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'exports'));
    fs.mkdirSync(dir, { recursive: true });
    const tables = ['settings', 'agents', 'clients', 'properties', 'sales', 'consignments', 'lots', 'charge_rates', 'account_sales', 'account_sale_lines', 'buyer_invoices', 'receipts', 'levy_returns', 'activity'];
    const cell = (v) => { if (v === null || v === undefined) return ''; const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
    for (const t of tables) {
      const rows = await db.query(`select * from ${t}`);
      const cols = rows.length ? Object.keys(rows[0]) : [];
      fs.writeFileSync(path.join(dir, `${t}.csv`), [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n');
    }
    return `Exported ${tables.length} CSV files to ${dir}`;
  },

  async 'draft-market-report'(db, f, pos) {
    const s = await resolve(db, 'sale', pos[0]);
    const r = await reports.market(db, f, [s.id]);
    const st = await settingsOf(db);
    const head = r.rows.reduce((n, x) => n + Number(x.head), 0);
    const lines = [`Subject: ${s.name}: market report`, '', `${head} head were sold at ${s.saleyard || 'the sale'} on ${s.sale_date}.`, ''];
    for (const x of r.rows) {
      const price = x.avg_c_per_kg !== null ? `averaged ${x.avg_c_per_kg}c/kg (${x.low_c_per_kg} to ${x.top_c_per_kg}c/kg), about $${x.avg_dollars_per_head}/hd at ${x.avg_kg}kg` : `averaged $${x.avg_dollars_per_head}/hd, top $${x.top_dollars_per_head}/hd`;
      lines.push(`- ${x.category[0].toUpperCase() + x.category.slice(1)}: ${x.head} head ${price}.${x.change !== 'new' ? ` ${x.change.startsWith('-') ? 'Down' : 'Up'} ${x.change.replace('-', '')} on the last sale.` : ''}`);
    }
    lines.push('', 'Call your agent to book stock for the next sale.', '', st.business_name);
    return writeDraft(`market-report-${slug(s.name)}.md`, lines.join('\n'));
  },

  async 'draft-nvd-chase'(db, f, pos) {
    const s = await resolve(db, 'sale', pos[0]);
    const rows = await db.query(`select c.ref, c.head_booked, c.description, v.name, v.email, v.contact, a.name as agent from consignments c join clients v on v.id = c.vendor_id left join agents a on a.id = c.agent_id
      where c.sale_id = $1 and c.nvd_number is null order by v.name`, [s.id]);
    const st = await settingsOf(db);
    const files = rows.map((r) => writeDraft(`nvd-chase-${slug(r.name)}-${s.sale_date}.md`, [
      `To: ${r.email ?? r.name}`, `Subject: NVD for ${s.name}`, '',
      `Hi ${(r.contact || r.name).split(/\s+/)[0]},`, '',
      `We have your ${r.head_booked} ${r.description.toLowerCase()} booked into ${s.name} on ${s.sale_date} (booking ${r.ref}). We still need the NVD for them before they can be sold.`,
      'Send the eNVD through, or send a photo of the paper copy, and we will do the rest.', '', r.agent || st.business_name, st.business_name,
    ].join('\n')));
    return files.length ? files.join('\n') : `Every consignment in ${s.name} has its NVD.`;
  },

  async 'draft-buyer-reminder'(db, f, pos) {
    const who = pos[0] ? [await resolve(db, 'client', pos[0])] : await db.query(`select buyer_id as id from v_debtors where worst_days > 0`);
    const st = await settingsOf(db);
    const files = [];
    for (const w of who) {
      const c = (await db.query('select * from clients where id = $1', [w.id]))[0];
      const inv = await db.query(`select number, sale, sale_date, balance_cents, due_on, days_overdue from v_invoices where buyer_id = $1 and balance_cents > 0 and days_overdue > 0 order by due_on`, [c.id]);
      if (!inv.length) continue;
      const total = inv.reduce((n, i) => n + Number(i.balance_cents), 0);
      files.push(writeDraft(`buyer-reminder-${slug(c.name)}.md`, [
        `To: ${c.email ?? c.name}`, `Subject: Stock account: ${money(total, st.currency)} past due`, '',
        `Hi ${(c.contact || c.name).split(/\s+/)[0]},`, '',
        'These invoices for stock you bought through us are past their due date:', '',
        ...inv.map((i) => `- ${i.number}, ${i.sale}: ${money(i.balance_cents, st.currency)}, due ${i.due_on}`), '',
        `That is ${money(total, st.currency)} in all. Vendors are paid on settlement day whether or not the buyer has paid, so please pay this week or ring to arrange it.`, '',
        st.business_name,
      ].join('\n')));
    }
    return files.length ? files.join('\n') : 'No buyer has an overdue invoice.';
  },

  async 'draft-vendor-results'(db, f, pos) {
    const s = await resolve(db, 'sale', pos[0]);
    const v = await resolve(db, 'client', pos[1]);
    const lots = await db.query(`select * from v_lots where sale_id = $1 and vendor_id = $2 and status in ('sold', 'passed_in') order by lot_no`, [s.id, v.id]);
    if (!lots.length) throw Error(`${v.name} had nothing in ${s.name}.`);
    const mkt = new Map((await reports.market(db, f, [s.id])).rows.map((m) => [m.category, m]));
    const st = await settingsOf(db);
    const lines = [`To: ${v.email ?? v.name}`, `Subject: Your results, ${s.name}`, '', `Hi ${(v.contact || v.name).split(/\s+/)[0]},`, '', 'Here is how your stock went:', ''];
    for (const l of lots) {
      if (l.status === 'passed_in') { lines.push(`- Lot ${l.lot_no}, ${l.head} ${l.category}: passed in. Ring me about the next sale.`); continue; }
      const m = mkt.get(l.category);
      lines.push(`- Lot ${l.lot_no}, ${l.head} ${l.category}${l.avg_kg ? ` at ${l.avg_kg}kg` : ''}: ${priceText(l)}, ${money(l.gross_cents, st.currency)} to ${l.buyer}.${m?.avg_c_per_kg && l.basis === 'kg' ? ` The ${l.category} averaged ${m.avg_c_per_kg}c/kg on the day.` : ''}`);
    }
    lines.push('', 'Your account sale follows once the sale is closed.', '', st.business_name);
    return writeDraft(`vendor-results-${slug(v.name)}-${s.sale_date}.md`, lines.join('\n'));
  },
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
function writeDraft(name, body) {
  const dir = path.join(REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body + '\n');
  return `draft: drafts/${name}`;
}

export const HELP = `Stock Agency CLI

Reports (add --json for machine output):
  attention                          everything that needs a decision today
  compliance [--all]                 the rules in docs/compliance.md checked against the records
  sales [--upcoming | --all]         sale <sale>   catalogue <sale>   results <sale>   market <sale>
  nvds [--days=14]                   vendor declarations for the coming sales
  transfers [--all]                  NLIS and NAIT transfers to record
  account-sales [--sale --vendor --unpaid]   account-sale <AS-number>   settlements
  debtors                            invoices [--buyer --sale --unpaid]
  clients [--kind=vendor|buyer]      client <name or PIC>
  buyers [--from --category]         vendors [--from]   agents [--from]
  levies [--month=YYYY-MM]           rates   weekly-review

Actions:
  add client --name= [--kind --region --email --phone --agent --pic --nait --processor --terms --limit --commission --not-gst]
  add property <client> --pic= [--name --nait --state --processor]   add agent --name= [--branch --share]
  add sale --date= [--name --saleyard --kind=prime|store|weaner|stud|clearing|private|online --species=cattle|sheep|mixed]
  add rate --code --label --kind=commission|fee|levy --basis=pct|per_head|per_lot --amount [--species --cap --min-price --saleyard-only --no-gst --remit-to]
  set <client|agent|sale|rate|settings> [name] --field=value
  book <sale> <vendor> --head=N --description="" [--species --category --pic --agent --nvd --treatment --lot]
  nvd <consignment> --number=   split <sale> <lot> --head=N [--category]
  sell <sale> <lot> --buyer= --price= [--kg=TOTAL] [--basis=head] [--head --pic --destination=slaughter|restock|feedlot|export --on]
       price is cents per kg (402.5) when sold by weight, dollars per head (215.50) when sold by the head
  pass <sale> <lot>   withdraw <sale> <lot>
  transfer <sale> <lot | --all> [--on --ref]   nvd-sent <sale> <lot | --buyer= | --all> [--on]
  close <sale> [--apply]            account sales and buyer invoices (test run first)
  settle <AS-number> [--on --ref]   receipt <INV-number> [--amount --on --ref]   lodge-levy --month=YYYY-MM [--on --ref]
  log <client> --note= [--sale --agent --on]
  import agrinous <businesses.csv> [--lots=sale-lots.csv --date-order=dmy|mdy --open --apply]
  export [--dir=exports]
  draft-market-report <sale>   draft-nvd-chase <sale>   draft-buyer-reminder [buyer]   draft-vendor-results <sale> <vendor>
Drafts go to drafts/. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database.`;

function print(result, json) {
  if (typeof result === 'string') { console.log(json ? JSON.stringify({ message: result }) : result); return; }
  const list = Array.isArray(result) ? result : [result];
  if (json) { console.log(JSON.stringify(list.length === 1 ? list[0].rows : Object.fromEntries(list.map((r) => [r.title, r.rows])), null, 2)); return; }
  for (const r of list) {
    console.log(heading(r.title));
    console.log(table(r.rows, r.columns.map((c) => ({ key: c, label: c.replaceAll('_', ' '), align: typeof r.rows[0]?.[c] === 'number' || /^-?\d+(\.\d+)?$/.test(String(r.rows[0]?.[c] ?? 'x')) ? 'right' : 'left', width: 60 }))));
  }
}

export async function run(argv, db) {
  const [cmd, ...rest] = argv;
  const { flags, pos } = parseArgs(rest);
  delete flags.json;
  if (!cmd || cmd === 'help' || flags.help) return HELP;
  if (reports[cmd]) return reports[cmd](db, flags, pos);
  if (actions[cmd]) return actions[cmd](db, flags, pos);
  throw Error(`Unknown command "${cmd}". Run with help to see them all.`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const db = await getDb();
  try {
    print(await run(argv, db), json);
  } catch (e) {
    console.error(e instanceof Ambiguous ? e.message : `Error: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}
