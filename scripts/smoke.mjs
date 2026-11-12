#!/usr/bin/env node
// npm test: a throwaway database, the migration, the demo agency pinned to 12 November 2026,
// then every report and action with assertions on the rules that matter. Needs no secrets.
// Runs on Windows and Linux. With TEST_DATABASE_URL set it runs against that (disposable) Postgres instead.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { seed } from './seed.mjs';
import { run, HELP } from './agency.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-agency-test-'));
process.env.DATA_DIR = path.join(dir, 'db');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
process.env.OUTPUT_DIR = dir;

let db, checks = 0;
const seen = new Set();
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const call = async (...args) => { seen.add(args[0]); return run(args, db); };
const rows = async (...args) => { const r = await call(...args); return Array.isArray(r) ? r[0].rows : r.rows; };
const reject = async (args, re) => { seen.add(args[0]); await assert.rejects(() => run(args, db), re); checks++; };
const one = async (sql, params = []) => (await db.query(sql, params))[0];
const cli = (...args) => spawnSync(process.execPath, ['scripts/agency.mjs', ...args], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
const TODAY = '2026-11-12';
const day = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const PRIME_MON = `Armidale Prime ${day(-3)}`;
const PRIME_LAST = `Armidale Prime ${day(-10)}`;
const PRIME_NEXT = `Armidale Prime ${day(4)}`;
const PADDOCK = `Paddock sale Wollun to Halloran ${day(-6)}`;

try {
  db = await getDb();
  if (process.env.TEST_DATABASE_URL) await db.exec('drop schema public cascade; create schema public;');
  eq((await migrate(db)).ran, ['0001_stock_agency.sql']);
  eq((await migrate(db)).ran.length, 0, 'migrate twice is safe');
  await db.query('update settings set as_of = $1', [TODAY]);
  await seed(db);
  const count = (await one('select count(*)::int n from lots')).n;
  await seed(db);
  eq((await one('select count(*)::int n from lots')).n, count, 'seed is idempotent');
  ok(count > 150, 'eleven prime sales, three sheep sales, a store sale and the coming sales');
  ok(HELP.includes('import agrinous'));

  // Every report runs.
  for (const name of ['attention', 'compliance', 'sales', 'nvds', 'transfers', 'account-sales', 'settlements', 'debtors', 'invoices', 'clients', 'buyers', 'vendors', 'agents', 'levies', 'rates', 'weekly-review']) {
    const r = await call(name);
    ok((Array.isArray(r) ? r : [r]).every((x) => Array.isArray(x.rows)), `${name} returns rows`);
  }
  for (const name of ['sale', 'catalogue', 'results', 'market']) {
    const r = await call(name, PRIME_MON);
    ok((Array.isArray(r) ? r : [r]).every((x) => Array.isArray(x.rows) && x.rows.length), `${name} has rows`);
  }

  // The desk's morning: everything that needs a decision.
  const att = await rows('attention');
  const reasons = new Set(att.map((r) => r.reason));
  for (const r of ['NVD not in', 'sale not closed', 'transfer overdue', 'NVD copy to buyer late', 'vendor not paid', 'buyer overdue', 'buyer over limit',
    'buyer cover lapsed', 'sold to a buyer on stop', 'levy return not lodged', 'vendor not booked this season']) ok(reasons.has(r), `attention shows ${r}`);
  eq(att.filter((r) => r.reason === 'NVD not in').map((r) => r.client).sort(), ['Hall and Daughters', 'Mihi Creek Partnership', 'Sarah and Pete Lyle']);
  eq(att.find((r) => r.reason === 'vendor not paid').client, 'Kentucky Station');
  eq(att.find((r) => r.reason === 'sold to a buyer on stop').client, 'Sandon Pastoral');
  eq(att.find((r) => r.reason === 'vendor not booked this season').client, 'Hillview Pastoral');
  eq(att.find((r) => r.reason === 'levy return not lodged').ref, '2026-10');
  eq(att.filter((r) => r.reason === 'buyer overdue').map((r) => r.client).sort(), ['Bellevue Grazing', 'Kelvale Feedlot']);

  // Series names: "Armidale Prime" is the latest held, and a date picks the sale on that day.
  const series = await call('sale', 'Armidale Prime');
  ok(series[0].title.startsWith(PRIME_MON), 'a series name resolves to the latest sale held');
  ok((await call('catalogue', day(4))).title.startsWith(PRIME_NEXT), 'a date resolves to that day\'s sale');
  await reject(['sale', 'Armidale'], /Say which one/);

  // The rules.
  const comp = await rows('compliance');
  const rule = (r, state) => comp.filter((c) => c.rule === r && (!state || c.state === state));
  eq(rule('NLIS-TRANSFER-2-DAYS', 'breached').length, 3, 'two Monday lots and the paddock sale are past 2 days');
  eq(rule('NVD-TO-BUYER-7-DAYS', 'breached').length, 1);
  ok(rule('NVD-TO-BUYER-7-DAYS', 'breached')[0].item.startsWith(PRIME_LAST));
  eq(rule('VENDOR-SETTLEMENT', 'breached').length, 1);
  eq(rule('LEVY-RETURN', 'due')[0].item, '2026-10');
  eq(rule('TRANSACTION-LEVY', 'breached').length, 0, 'every closed lot carries its levy');

  // Money: one account sale adds up, levies follow the federal rates.
  const as = await one(`select a.* from account_sales a join clients c on c.id = a.vendor_id join sales s on s.id = a.sale_id where c.name = 'Kentucky Station' and s.name = $1`, [PRIME_LAST]);
  const lines = await db.query('select code, sum(amount_cents)::bigint a, sum(gst_cents)::bigint g, sum(head)::int h from account_sale_lines where account_sale_id = $1 group by code', [as.id]);
  const line = Object.fromEntries(lines.map((l) => [l.code, l]));
  eq(Number(line['CATTLE-LEVY'].a), line['CATTLE-LEVY'].h * 500, '$5 a head cattle transaction levy');
  eq(Number(line['CATTLE-LEVY'].g), 0, 'no GST on a levy');
  eq(Number(line.COMMISSION.a), Math.round(Number(as.gross_cents) * 0.035), 'Kentucky Station pays its agreed 3.5%');
  eq(Number(as.net_cents), Number(as.gross_cents) + Number(as.gst_cents) - lines.reduce((n, l) => n + Number(l.a) + Number(l.g), 0), 'net = gross + GST - charges');
  const lambs = await one(`select sum(ln.amount_cents)::bigint a, sum(ln.head)::int h from account_sale_lines ln where ln.code = 'LAMB-LEVY'`);
  eq(Number(lambs.a), lambs.h * 150, 'lambs over $75 a head pay the $1.50 cap');
  const sheep = await one(`select sum(ln.amount_cents)::bigint a, sum(ln.head)::int h from account_sale_lines ln where ln.code = 'SHEEP-LEVY'`);
  eq(Number(sheep.a), sheep.h * 20, 'sheep over $10 a head pay the 20 cent cap');
  const paddockDues = await one(`select count(*)::int n from v_lot_charges ch join sales s on s.id = ch.sale_id where s.kind = 'private' and ch.code like 'YARD-DUES%'`);
  eq(paddockDues.n, 0, 'no yard dues on a private sale');

  // Sale day: book, split, sell, pass, close.
  await reject(['close', PRIME_NEXT], /no result/);
  ok((await call('book', PRIME_NEXT, 'Glen Morrison', '--head=20', '--description=Angus steers, yearling', '--category=steers')).includes('NVD not in yet'));
  const c = await one(`select c.ref from consignments c join clients v on v.id = c.vendor_id join sales s on s.id = c.sale_id where v.name = 'Glen Morrison' and s.name = $1`, [PRIME_NEXT]);
  ok((await call('nvd', c.ref, '--number=NVD09912345')).includes('NVD09912345'));
  const lotNo = (await one(`select l.lot_no from lots l join consignments c on c.id = l.consignment_id where c.ref = $1`, [c.ref])).lot_no;
  ok((await call('split', PRIME_NEXT, lotNo, '--head=8', '--category=heifers')).includes('Split 8 head'));
  await reject(['sell', PRIME_NEXT, lotNo, '--buyer=Kelvale', '--price=4.05', '--kg=4800'], /looks wrong/);
  ok((await call('sell', PRIME_NEXT, lotNo, '--buyer=Kelvale Feedlot', '--price=405', '--kg=4920', '--destination=feedlot')).includes('$19,926'));
  const sold = await one(`select gross_cents from v_lots where sale = $1 and lot_no = $2`, [PRIME_NEXT, lotNo]);
  eq(Number(sold.gross_cents), 1992600, '4,920 kg at 405c/kg');
  const others = await db.query(`select lot_no from lots where sale_id = (select id from sales where name = $1) and status = 'unsold' order by lot_no`, [PRIME_NEXT]);
  for (const [i, o] of others.entries()) {
    if (i === 0) await call('pass', PRIME_NEXT, o.lot_no);
    else if (i === 1) await call('withdraw', PRIME_NEXT, o.lot_no);
    else await call('sell', PRIME_NEXT, o.lot_no, '--buyer=Northern Tablelands Meats', '--price=330', `--kg=${(i + 1) * 1000}`);
  }
  const onStop = await call('sell', PADDOCK, '1', '--buyer=Sandon Pastoral', '--basis=head', '--price=2450');
  ok(onStop.includes('on stop'), 'selling to a buyer on stop warns');
  await call('sell', PADDOCK, '1', '--buyer=Jim Halloran', '--basis=head', '--price=2450');
  const preview = await call('close', PRIME_NEXT);
  ok(preview[0].title.startsWith('Test run'), 'close is a test run without --apply');
  eq((await one('select status from sales where name = $1', [PRIME_NEXT])).status, 'booking');
  ok((await call('close', PRIME_NEXT, '--apply')).includes('closed'));
  await reject(['close', PRIME_NEXT], /already closed/);
  await reject(['sell', PRIME_NEXT, lotNo, '--buyer=Kelvale Feedlot', '--price=400', '--kg=100'], /closed/);
  const glen = await one(`select a.number, a.net_cents from account_sales a join clients c on c.id = a.vendor_id join sales s on s.id = a.sale_id where c.name = 'Glen Morrison' and s.name = $1`, [PRIME_NEXT]);
  ok(glen, 'Glen Morrison has an account sale');
  const asOut = await call('account-sale', glen.number);
  eq(asOut[2].rows.map((r) => r.label).sort(), ['Cattle transaction levy', 'Selling commission', 'Yard dues']);
  ok((await call('settle', glen.number, '--ref=EFT 1001')).includes('marked paid'));
  await reject(['settle', glen.number], /was paid/);

  // Close Monday's sale, then the transfers and NVD copies.
  ok((await call('close', PRIME_MON, '--apply')).includes('account sales'));
  ok((await call('transfer', PRIME_MON, '3', '--ref=NLIS-X1')).includes('1 lot'));
  ok((await call('transfer', PRIME_MON, '--all')).includes('Transfer recorded'));
  await call('transfer', PADDOCK, '1');
  const late = (await rows('compliance')).filter((r) => r.rule === 'NLIS-TRANSFER-2-DAYS' && r.state === 'breached');
  eq(late.length, 3, 'a late transfer stays on the record as done late');
  eq((await rows('transfers')).filter((t) => t.sale === PRIME_MON).length, 0, 'nothing left to transfer on Monday');
  ok((await call('nvd-sent', PRIME_MON, '--all')).includes('NVD copy sent'));
  await reject(['nvd-sent', PRIME_MON, '--all'], /No matching lots/);

  // Buyers pay, vendors are paid, the levy return is lodged.
  const kel = await one(`select number, balance_cents from v_invoices where buyer = 'Kelvale Feedlot' and balance_cents > 0 order by due_on limit 1`);
  await reject(['receipt', kel.number, `--amount=${Number(kel.balance_cents) / 100 + 1}`], /more than that/);
  ok((await call('receipt', kel.number, '--amount=1000')).includes('still owing'));
  ok((await call('receipt', kel.number)).includes('0.00 still owing'));
  ok((await call('lodge-levy', '--month=2026-10', '--ref=LRS 4471')).includes('lodged'));
  ok(!(await rows('attention')).some((r) => r.reason === 'levy return not lodged'), 'October lodged');
  const lev = await rows('levies', '--month=2026-10');
  ok(lev.every((l) => l.lodged === TODAY));

  // Clients, settings, rates, notes.
  ok((await call('add', 'client', '--name=Waihi Downs', '--kind=vendor', '--pic=987654321', '--nait')).includes('NAIT number'));
  ok((await call('add', 'property', 'Jim Halloran', '--pic=NA900399', '--name=Halloran back block')).includes('NA900399'));
  ok((await call('add', 'agent', '--name=Lucy Barr', '--branch=Walcha')).includes('Lucy Barr'));
  ok((await call('set', 'client', 'Bellevue', '--on-stop=yes', '--credit-limit=30000')).includes('on_stop'));
  eq((await one(`select on_stop, credit_limit_cents from clients where name = 'Bellevue Grazing'`)), { on_stop: true, credit_limit_cents: 3000000 });
  await reject(['set', 'client', 'Bellevue', '--password=x'], /Unknown field/);
  ok((await call('add', 'rate', '--code=TRANSIT', '--label=Transit insurance', '--kind=fee', '--basis=pct', '--amount=0.1')).includes('TRANSIT'));
  ok((await call('set', 'rate', 'TRANSIT', '--active=no')).includes('active'));
  ok((await call('log', 'Hillview', '--note=Rang about the March weaners.')).includes('Hillview Pastoral'));
  const hv = await call('client', 'NA401533');
  eq(hv[0].rows[0].name, 'Hillview Pastoral', 'a PIC finds its client');

  // New Zealand: a paddock sale between NAIT locations carries the 48 hours; a saleyard sale does not.
  await call('set', 'settings', '--country=NZ', '--gst-pct=15');
  await call('add', 'client', '--name=Te Awa Station', '--kind=buyer', '--pic=123456789', '--nait');
  await call('add', 'sale', `--date=${day(-5)}`, '--name=Waihi to Te Awa', '--kind=private');
  await call('book', 'Waihi to Te Awa', 'Waihi Downs', '--head=40', '--description=R2 steers', '--category=steers', '--nvd=ASD-1188');
  await call('sell', 'Waihi to Te Awa', '1', '--buyer=Te Awa Station', '--basis=head', '--price=1450', `--on=${day(-5)}`);
  const nait = (await rows('compliance')).filter((r) => r.rule === 'NAIT-48-HOURS');
  eq(nait.length, 1);
  eq(nait[0].state, 'breached', 'NAIT movement not recorded within 48 hours');
  await call('set', 'settings', '--country=AU', '--gst-pct=10');

  // Import from AgriNous: test run first, then apply; a second run updates, never duplicates.
  const biz = path.join(REPO_ROOT, 'fixtures', 'agrinous', 'businesses.csv');
  const lotsCsv = path.join(REPO_ROOT, 'fixtures', 'agrinous', 'sale-lots.csv');
  const before = (await one('select count(*)::int n from clients')).n;
  ok((await call('import', 'agrinous', biz, `--lots=${lotsCsv}`)).includes('Test run'));
  eq((await one('select count(*)::int n from clients')).n, before, 'a test run writes nothing');
  const imp = await call('import', 'agrinous', biz, `--lots=${lotsCsv}`, '--apply');
  ok(imp.includes('clients created: 3') && imp.includes('lots created: 5'), imp);
  const yarrow = await one(`select gross_cents, buyer, status from v_lots where vendor = 'Yarrowyck Pastoral' and lot_no = '1'`);
  eq([Number(yarrow.gross_cents), yarrow.buyer, yarrow.status], [Math.round(5880 * 398.5), 'Tenterfield Meat Co', 'sold']);
  eq((await one(`select l.status from lots l join sales s on s.id = l.sale_id where s.source = 'agrinous' and l.lot_no = '4'`)).status, 'passed_in');
  eq((await one(`select basis, price_cents from v_lots where vendor = 'Hall and Daughters' and sale_source = 'agrinous'`)), { basis: 'head', price_cents: '21800.00' }, '$218/hd stored as cents per head');
  eq((await one(`select count(*)::int n from clients where name = 'Kentucky Station'`)).n, 1, 'an existing client is matched, not duplicated');
  eq((await one(`select kind from clients where name = 'Tenterfield Meat Co'`)).kind, 'buyer');
  ok((await call('import', 'agrinous', biz, `--lots=${lotsCsv}`, '--apply')).includes('lots updated: 5'), 'a second import updates');
  ok(!(await rows('compliance')).some((r) => r.item.includes('Armidale 2026-08-05')), 'imported history is not judged against rules it was never run under');
  const bad = path.join(dir, 'bad.csv');
  fs.writeFileSync(bad, 'Vendor,Price\nSomeone,300\n');
  await reject(['import', 'agrinous', '-', `--lots=${bad}`], /missing lot no/);

  // Export, drafts.
  ok((await call('export', `--dir=${path.join(dir, 'exports')}`)).includes('14 CSV files'));
  ok(fs.readFileSync(path.join(dir, 'exports', 'lots.csv'), 'utf8').includes('Yarrowyck') || fs.readFileSync(path.join(dir, 'exports', 'clients.csv'), 'utf8').includes('Yarrowyck'));
  const drafts = [];
  const mr = await call('draft-market-report', PRIME_LAST);
  drafts.push(mr);
  const mrBody = fs.readFileSync(path.join(REPO_ROOT, mr.replace('draft: ', '')), 'utf8');
  ok(mrBody.includes('c/kg') && mrBody.includes('Tablelands Stock and Station Agents'), 'the market report carries prices and the agency');
  const chase = await call('draft-nvd-chase', `Armidale Sheep and Lamb ${day(7)}`);
  ok(chase.includes('nvd-chase-hall-and-daughters'));
  drafts.push(chase);
  const rem = await call('draft-buyer-reminder');
  ok(rem.includes('buyer-reminder-bellevue-grazing'));
  drafts.push(...rem.split('\n'));
  const vr = await call('draft-vendor-results', PRIME_LAST, 'Kentucky Station');
  ok(fs.readFileSync(path.join(REPO_ROOT, vr.replace('draft: ', '')), 'utf8').includes('Hi Kentucky'));
  drafts.push(vr);
  for (const d of drafts) for (const f of d.split('\n')) fs.rmSync(path.join(REPO_ROOT, f.replace('draft: ', '')), { force: true });

  // The CLI as a process: tables, --json, and exit 1 with candidates when a name is ambiguous.
  await db.close(); db = null;
  const json = cli('clients', '--json');
  eq(json.status, 0, json.stderr);
  ok(JSON.parse(json.stdout).length >= 30, 'clients as JSON');
  const amb = cli('client', 'a');
  eq(amb.status, 1);
  ok(amb.stderr.includes('Say which one'));
  ok(cli('attention').stdout.includes('reason'));
  ok(cli('help').stdout.includes('Stock Agency CLI'));

  // Documents and views in the agency's brand.
  for (const script of ['docs', 'view']) {
    const res = spawnSync(process.execPath, [`scripts/${script}.mjs`], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
    eq(res.status, 0, res.stderr);
  }
  ok(fs.readFileSync(path.join(dir, 'views', 'week.html'), 'utf8').includes('Needs attention'));
  ok(fs.readFileSync(path.join(dir, 'views', 'compliance.html'), 'utf8').includes('NLIS-TRANSFER-2-DAYS'));
  const asFiles = fs.readdirSync(path.join(dir, 'docs-out', 'account-sale'));
  const glenDoc = fs.readFileSync(path.join(dir, 'docs-out', 'account-sale', asFiles.find((f) => f.includes('glen-morrison'))), 'utf8');
  ok(glenDoc.includes('net proceeds to you') && glenDoc.includes('Cattle transaction levy') && glenDoc.includes('Tablelands Stock and Station Agents'), 'the account sale carries the levy and the agency');
  ok(fs.readdirSync(path.join(dir, 'docs-out', 'buyer-invoice')).length > 0);
  ok(fs.readdirSync(path.join(dir, 'docs-out', 'market-report')).length > 0);

  const recipes = fs.readdirSync(path.join(REPO_ROOT, '.claude', 'commands')).filter((f) => f.endsWith('.md') && f !== 'README.md');
  console.log(`PASS: ${checks} checks; ${seen.size} CLI commands exercised; ${recipes.length} slash commands; documents and views rendered.`);
} finally {
  await db?.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
