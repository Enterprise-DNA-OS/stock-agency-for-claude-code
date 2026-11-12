// Bring clients and sale history across from AgriNous.
// Two CSV exports: the Business Portal's client list (three dots, Export CSV) and a sale lots report
// from Sale Reports (Sale Export or Multi Sale Report, as CSV). Column names vary by report and by
// agency, so every column is matched by the names below, case-insensitive. Unknown columns are listed, never guessed.
import fs from 'node:fs';
import { parseCsv, pick } from './csv.mjs';

export const BUSINESS_COLUMNS = {
  name: ['Business Name', 'Business', 'Trading Name', 'Name', 'Client', 'Client Name'],
  pic: ['PIC', 'PIC Number', 'Property Identification Code', 'NAIT Number', 'NAIT Location'],
  property: ['Property', 'Property Name'],
  kind: ['Type', 'Client Type', 'Business Type', 'Role'],
  tax_no: ['ABN', 'NZBN', 'GST Number'],
  email: ['Email', 'Email Address', 'Primary Email'],
  phone: ['Phone', 'Mobile', 'Phone Number', 'Mobile Number'],
  address: ['Address', 'Postal Address', 'Street Address'],
  region: ['Town', 'Suburb', 'Locality', 'Region'],
  state: ['State'],
  contact: ['Contact', 'Contact Name', 'Primary Contact'],
};

export const LOT_COLUMNS = {
  sale: ['Sale', 'Sale Name', 'Sale Title'],
  sale_date: ['Sale Date', 'Date'],
  saleyard: ['Saleyard', 'Location', 'Yard'],
  lot_no: ['Lot', 'Lot No', 'Lot Number', 'Pen'],
  vendor: ['Vendor', 'Vendor Name', 'Seller'],
  vendor_pic: ['Vendor PIC', 'Vendor NAIT', 'From PIC'],
  buyer: ['Buyer', 'Buyer Name', 'Purchaser'],
  buyer_pic: ['Buyer PIC', 'Buyer NAIT', 'Destination PIC', 'To PIC'],
  head: ['Head', 'Hd', 'Quantity', 'Qty', 'Number'],
  species: ['Species'],
  category: ['Category', 'Description', 'Sex', 'Class'],
  weight: ['Total Weight', 'Weight', 'Weight (kg)', 'Total kg'],
  price: ['Price', 'Bid', 'Price (c/kg)', 'Price ($/hd)'],
  price_type: ['Price Type', 'Price Unit', 'Unit', 'Sold By'],
  nvd: ['NVD', 'NVD Number', 'NVD Serial', 'ASD'],
  status: ['Status', 'Result'],
  agent: ['Agent', 'Agent Name'],
};

// 12/11/2026, 12-11-2026, 2026-11-12. Day first unless told otherwise.
export function toDate(v, order = 'dmy', what = 'date') {
  const s = String(v ?? '').trim();
  if (!s) throw Error(`Required: ${what}`);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) throw Error(`${what}: "${s}" is not a date (use YYYY-MM-DD or DD/MM/YYYY)`);
  const [a, b, y] = [m[1], m[2], m[3].length === 2 ? `20${m[3]}` : m[3]];
  const [d, mo] = order === 'mdy' ? [b, a] : [a, b];
  if (Number(mo) > 12 || Number(d) > 31) throw Error(`${what}: "${s}" is not a valid date`);
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// "$1,234.50" -> 123450 cents. Plain numbers are dollars.
export function cents(v) {
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw Error(`"${v}" is not an amount`);
  return Math.round(n * 100);
}

function unknownColumns(rows, map) {
  if (!rows.length) return [];
  const known = new Set(Object.values(map).flat().map((c) => c.toLowerCase()));
  return Object.keys(rows[0]).filter((k) => !known.has(k.toLowerCase()));
}

const speciesOf = (raw, category) => {
  const s = `${raw} ${category}`.toLowerCase();
  if (/lamb/.test(s)) return 'lambs';
  if (/sheep|ewe|wether|ram|hogget|merino/.test(s)) return 'sheep';
  if (/goat|kid|doe|buck/.test(s)) return 'goats';
  return 'cattle';
};

export async function importAgrinous(db, file, { lots, apply = false, dateOrder = 'dmy', open = false, scheme = 'NLIS' } = {}) {
  const out = { clients_created: 0, clients_matched: 0, properties_created: 0, sales_created: 0, lots_created: 0, lots_updated: 0, skipped: [], unknown: [] };
  const businesses = file ? parseCsv(fs.readFileSync(file, 'utf8')) : [];
  const lotRows = lots ? parseCsv(fs.readFileSync(lots, 'utf8')) : [];
  if (file && businesses.length && !pick(businesses[0], ...BUSINESS_COLUMNS.name) && !Object.keys(businesses[0]).some((k) => BUSINESS_COLUMNS.name.map((c) => c.toLowerCase()).includes(k.toLowerCase()))) {
    throw Error(`${file}: missing a business name column (one of ${BUSINESS_COLUMNS.name.join(', ')})`);
  }
  if (lots && lotRows.length) {
    const keys = Object.keys(lotRows[0]).map((k) => k.toLowerCase());
    for (const need of ['lot_no', 'vendor', 'head']) {
      if (!LOT_COLUMNS[need].some((c) => keys.includes(c.toLowerCase()))) throw Error(`${lots}: missing ${need.replace('_', ' ')} column (one of ${LOT_COLUMNS[need].join(', ')})`);
    }
  }
  out.unknown = [...unknownColumns(businesses, BUSINESS_COLUMNS).map((c) => `businesses: ${c}`), ...unknownColumns(lotRows, LOT_COLUMNS).map((c) => `lots: ${c}`)];

  await db.exec('BEGIN');
  try {
    const clientIds = new Map();
    async function client(name, pic, extra = {}) {
      const key = name.toLowerCase();
      if (clientIds.has(key)) return clientIds.get(key);
      let row = (await db.query('select id from clients where lower(name) = $1', [key]))[0];
      if (!row && pic) row = (await db.query('select client_id as id from properties where upper(pic) = upper($1)', [pic]))[0];
      if (row) { out.clients_matched++; }
      else {
        row = (await db.query(`insert into clients (name, kind, tax_no, email, phone, address, region, contact) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
          [name, extra.kind || 'both', extra.tax_no || null, extra.email || null, extra.phone || null, extra.address || null, extra.region || null, extra.contact || null]))[0];
        out.clients_created++;
      }
      if (pic && !(await db.query('select 1 from properties where upper(pic) = upper($1)', [pic])).length) {
        await db.query('insert into properties (client_id, name, pic, scheme, state) values ($1, $2, $3, $4, $5)',
          [row.id, extra.property || `${name} property`, pic.toUpperCase(), /^\d{9,}$/.test(pic) ? 'NAIT' : scheme, extra.state || null]);
        out.properties_created++;
      }
      clientIds.set(key, row.id);
      return row.id;
    }

    for (const [i, r] of businesses.entries()) {
      const name = pick(r, ...BUSINESS_COLUMNS.name).trim();
      if (!name) { out.skipped.push(`businesses row ${i + 2}: no name`); continue; }
      const kindRaw = pick(r, ...BUSINESS_COLUMNS.kind).toLowerCase();
      const kind = /vendor|seller|producer/.test(kindRaw) ? 'vendor' : /buyer|processor|feedlot|purchaser/.test(kindRaw) ? 'buyer' : 'both';
      await client(name, pick(r, ...BUSINESS_COLUMNS.pic).trim(), {
        kind, tax_no: pick(r, ...BUSINESS_COLUMNS.tax_no), email: pick(r, ...BUSINESS_COLUMNS.email), phone: pick(r, ...BUSINESS_COLUMNS.phone),
        address: pick(r, ...BUSINESS_COLUMNS.address), region: pick(r, ...BUSINESS_COLUMNS.region), state: pick(r, ...BUSINESS_COLUMNS.state),
        contact: pick(r, ...BUSINESS_COLUMNS.contact), property: pick(r, ...BUSINESS_COLUMNS.property),
      });
    }

    const saleIds = new Map();
    for (const [i, r] of lotRows.entries()) {
      const where = `lots row ${i + 2}`;
      try {
        const vendor = pick(r, ...LOT_COLUMNS.vendor).trim();
        const head = Number(pick(r, ...LOT_COLUMNS.head));
        const lotNo = pick(r, ...LOT_COLUMNS.lot_no).trim();
        if (!vendor || !lotNo || !(head > 0)) { out.skipped.push(`${where}: needs a lot, a vendor and a head count`); continue; }
        const date = toDate(pick(r, ...LOT_COLUMNS.sale_date), dateOrder, `${where} sale date`);
        const saleName = pick(r, ...LOT_COLUMNS.sale).trim() || `${pick(r, ...LOT_COLUMNS.saleyard).trim() || 'Sale'} ${date}`;
        let saleId = saleIds.get(saleName.toLowerCase());
        if (!saleId) {
          const found = (await db.query('select id from sales where lower(name) = lower($1)', [saleName]))[0];
          if (found) saleId = found.id;
          else {
            saleId = (await db.query(`insert into sales (name, sale_date, saleyard, kind, species, status, closed_on, source, notes) values ($1, $2, $3, 'prime', 'mixed', $4, $5, $6, 'Imported from AgriNous') returning id`,
              [saleName, date, pick(r, ...LOT_COLUMNS.saleyard) || null, open ? 'booking' : 'closed', open ? null : date, open ? null : 'agrinous']))[0].id;
            out.sales_created++;
          }
          saleIds.set(saleName.toLowerCase(), saleId);
        }
        const category = pick(r, ...LOT_COLUMNS.category).trim() || 'mixed';
        const species = speciesOf(pick(r, ...LOT_COLUMNS.species), category);
        const vendorId = await client(vendor, pick(r, ...LOT_COLUMNS.vendor_pic).trim(), { kind: 'vendor' });
        const buyerName = pick(r, ...LOT_COLUMNS.buyer).trim();
        const buyerPic = pick(r, ...LOT_COLUMNS.buyer_pic).trim();
        const buyerId = buyerName ? await client(buyerName, buyerPic, { kind: 'buyer' }) : null;
        const vprop = (await db.query('select id from properties where client_id = $1 order by created_at limit 1', [vendorId]))[0];
        const bprop = buyerId ? (buyerPic ? (await db.query('select id from properties where upper(pic) = upper($1)', [buyerPic]))[0] : (await db.query('select id from properties where client_id = $1 limit 1', [buyerId]))[0]) : null;
        let cons = (await db.query('select id from consignments where sale_id = $1 and vendor_id = $2 and species = $3', [saleId, vendorId, species]))[0];
        if (!cons) {
          cons = (await db.query(`insert into consignments (ref, sale_id, vendor_id, property_id, species, description, head_booked, nvd_number)
            values ('C-' || nextval('consignment_ref_seq'), $1, $2, $3, $4, $5, $6, $7) returning id`, [saleId, vendorId, vprop?.id || null, species, category, head, pick(r, ...LOT_COLUMNS.nvd) || null]))[0];
        } else {
          await db.query('update consignments set head_booked = head_booked + $2 where id = $1', [cons.id, head]);
        }
        const unit = pick(r, ...LOT_COLUMNS.price_type).toLowerCase();
        const weight = Number(String(pick(r, ...LOT_COLUMNS.weight)).replace(/,/g, '')) || null;
        const basis = /hd|head|\$/.test(unit) || (!unit && !weight) ? 'head' : 'kg';
        const priceRaw = String(pick(r, ...LOT_COLUMNS.price)).replace(/[$,\s]/g, '');
        const price = priceRaw === '' ? null : basis === 'head' ? Math.round(Number(priceRaw) * 100) : Number(priceRaw);
        const statusRaw = pick(r, ...LOT_COLUMNS.status).toLowerCase();
        const status = buyerId && price !== null && !/pass|no sale|unsold/.test(statusRaw) ? 'sold' : /pass/.test(statusRaw) ? 'passed_in' : 'unsold';
        if (basis === 'kg' && status === 'sold' && !weight) { out.skipped.push(`${where}: sold by the kilogram with no weight`); continue; }
        const existing = (await db.query('select id from lots where sale_id = $1 and lot_no = $2', [saleId, lotNo]))[0];
        const vals = [head, category, basis, weight, price, status, status === 'sold' ? buyerId : null, status === 'sold' ? bprop?.id || null : null, status === 'sold' ? date : null];
        if (existing) {
          await db.query(`update lots set head = $2, category = $3, basis = $4, weight_kg = $5, price_cents = $6, status = $7, buyer_id = $8, buyer_property_id = $9, sold_on = $10 where id = $1`, [existing.id, ...vals]);
          out.lots_updated++;
        } else {
          await db.query(`insert into lots (sale_id, consignment_id, lot_no, head, category, basis, weight_kg, price_cents, status, buyer_id, buyer_property_id, sold_on, transfer_done_on, nvd_sent_on)
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`, [saleId, cons.id, lotNo, ...vals, open ? null : vals[8]]);
          out.lots_created++;
        }
      } catch (e) {
        out.skipped.push(`${where}: ${e.message}`);
      }
    }
    await db.exec(apply ? 'COMMIT' : 'ROLLBACK');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
  return out;
}
