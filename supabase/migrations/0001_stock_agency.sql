-- Stock Agency for Claude Code: the schema.
-- The clients a livestock agency sells for and to, their properties (PICs and NAIT numbers),
-- the sales it runs, the consignments booked into each sale, the lots sold, what comes off
-- each vendor's cheque (commission, yard dues, transaction levies), the account sales and
-- buyer invoices that go out after the sale, and the NLIS or NAIT transfer every sold lot needs.
-- Plain Postgres. Runs on any Postgres (Supabase, Neon, RDS) and on the embedded PGlite.
-- Money is stored in cents. A lot's price is cents per kilogram (basis 'kg') or cents per head (basis 'head').

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- One row. as_of pins "today" for testing and demos; leave it empty in real use.
create table settings (
  id int primary key default 1 check (id = 1),
  business_name text not null default 'Your Livestock Agency',
  agency_code text,                                   -- your NLIS agent code or NAIT agency number
  currency text not null default 'AUD',
  country text not null default 'AU' check (country in ('AU', 'NZ')),
  gst_pct numeric(5,2) not null default 10,           -- 10 in Australia, 15 in New Zealand
  commission_pct numeric(5,2) not null default 4,     -- default selling commission on gross, before GST
  vendor_settle_days int not null default 7,          -- days after the sale that vendor proceeds are paid (your policy)
  buyer_terms_days int not null default 7,            -- days after the sale that a buyer must pay (your policy)
  transfer_days int not null default 2,               -- NLIS: off the agent code within 2 days. NAIT: within 48 hours
  nvd_to_buyer_days int not null default 7,           -- NSW: NVD copy to a non-slaughter buyer within 7 days
  quiet_after_days int not null default 120,          -- a vendor who sold last season and has not booked in this many days
  as_of date,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);

create or replace function agency_today() returns date language sql stable as $$
  select coalesce((select as_of from settings where id = 1), current_date)
$$;

create table agents (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  branch text,
  phone text,
  email text,
  commission_share_pct numeric(5,2) not null default 50,   -- the agent's share of the commission they bring in
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A client is anyone you sell for (vendor), buy for or sell to (buyer), or both.
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null default 'both' check (kind in ('vendor', 'buyer', 'both')),
  contact text,
  phone text,
  email text,
  address text,
  region text,
  tax_no text,                                  -- ABN or NZBN / GST number
  gst_registered boolean not null default true,
  agent_id uuid references agents(id),          -- whose client this is
  commission_pct numeric(5,2),                  -- this vendor's agreed rate; empty uses settings
  terms_days int,                               -- this buyer's terms; empty uses settings
  credit_limit_cents bigint,
  insured_until date,                           -- buyer's credit insurance cover, if you insure your book
  on_stop boolean not null default false,       -- no more stock to this buyer until they pay
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A property is where stock comes from or goes to. In Australia it has a PIC (NLIS);
-- in New Zealand a NAIT location number.
create table properties (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  name text not null,
  pic text not null unique,
  scheme text not null default 'NLIS' check (scheme in ('NLIS', 'NAIT')),
  state text,
  is_processor boolean not null default false,  -- an abattoir or meatworks: stock goes to slaughter
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sale_date date not null,
  saleyard text,
  kind text not null default 'prime' check (kind in ('prime', 'store', 'weaner', 'stud', 'clearing', 'private', 'online')),
  species text not null default 'cattle' check (species in ('cattle', 'sheep', 'mixed')),
  status text not null default 'booking' check (status in ('booking', 'closed')),
  closed_on date,
  source text,                                   -- 'agrinous' for history brought across: its paperwork stays where it was written
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- What a vendor books into a sale: the mob, where it comes from, and its NVD.
create table consignments (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,                      -- C-1001: what the agent writes on the booking sheet
  sale_id uuid not null references sales(id),
  vendor_id uuid not null references clients(id),
  property_id uuid references properties(id),
  agent_id uuid references agents(id),
  species text not null check (species in ('cattle', 'sheep', 'lambs', 'goats')),
  description text not null,                     -- "Angus steers, yearling, grain assisted"
  head_booked int not null check (head_booked > 0),
  nvd_number text,                               -- LPA NVD serial (AU) or ASD number (NZ)
  nvd_received_on date,
  treatment_note text,                           -- any treatment still inside its withholding period or ESI
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence consignment_ref_seq start 1001;

create table lots (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id),
  consignment_id uuid not null references consignments(id),
  lot_no text not null,
  head int not null check (head > 0),
  category text not null,                        -- steers, heifers, cows, bulls, vealers, weaners, lambs, ewes, wethers, rams
  basis text not null default 'kg' check (basis in ('kg', 'head')),
  weight_kg numeric(12,1),                       -- total live weight for the lot, when sold by the kilogram
  price_cents numeric(12,2),                     -- cents per kg (basis kg) or cents per head (basis head)
  status text not null default 'unsold' check (status in ('unsold', 'sold', 'passed_in', 'withdrawn')),
  buyer_id uuid references clients(id),
  buyer_property_id uuid references properties(id),
  destination text check (destination in ('slaughter', 'restock', 'feedlot', 'export')),
  sold_on date,
  transfer_done_on date,                         -- NLIS or NAIT transfer recorded
  transfer_ref text,
  nvd_sent_on date,                              -- NVD copy to the buyer (or to the abattoir with the stock)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sale_id, lot_no),
  check (status <> 'sold' or (buyer_id is not null and price_cents is not null and sold_on is not null)),
  check (status <> 'sold' or basis = 'head' or weight_kg is not null)
);

-- What comes off the vendor's cheque. basis:
--   pct       amount is a percentage of gross (cap_cents_per_head and min_price_cents_per_head make it a levy)
--   per_head  amount is cents per head
--   per_lot   amount is cents per lot
-- species empty = every species. sale_kind empty = every kind of sale.
create table charge_rates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  kind text not null check (kind in ('commission', 'fee', 'levy')),
  basis text not null check (basis in ('pct', 'per_head', 'per_lot')),
  amount numeric(12,4) not null,
  species text,
  sale_kind text,
  cap_cents_per_head numeric(12,2),
  min_price_cents_per_head numeric(12,2),
  saleyard_only boolean not null default false,   -- yard dues: not charged on private or online sales
  gst boolean not null default true,              -- GST added to this charge (levies carry none)
  remit_to text,                                  -- who the money goes to, when it is not yours
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence account_sale_seq start 2001;
create sequence buyer_invoice_seq start 5001;

-- One account sale per vendor per sale: the gross, what came off, and what they are paid.
create table account_sales (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  sale_id uuid not null references sales(id),
  vendor_id uuid not null references clients(id),
  head int not null,
  gross_cents bigint not null,
  gst_cents bigint not null,                      -- GST on the stock, when the vendor is registered
  charges_cents bigint not null,                  -- commission, fees and levies, GST included
  net_cents bigint not null,
  due_on date not null,
  paid_on date,
  paid_ref text,
  created_at timestamptz not null default now(),
  unique (sale_id, vendor_id)
);

create table account_sale_lines (
  id uuid primary key default gen_random_uuid(),
  account_sale_id uuid not null references account_sales(id) on delete cascade,
  lot_id uuid references lots(id),
  code text not null,
  label text not null,
  kind text not null,
  head int,
  amount_cents bigint not null,
  gst_cents bigint not null default 0,
  remit_to text
);

create table buyer_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  sale_id uuid not null references sales(id),
  buyer_id uuid not null references clients(id),
  head int not null,
  gross_cents bigint not null,
  gst_cents bigint not null,
  total_cents bigint not null,
  due_on date not null,
  created_at timestamptz not null default now(),
  unique (sale_id, buyer_id)
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references buyer_invoices(id),
  amount_cents bigint not null check (amount_cents > 0),
  received_on date not null,
  reference text,
  created_at timestamptz not null default now()
);

-- Transaction levies go to the government on a monthly or annual return. One row per month lodged.
create table levy_returns (
  month date primary key check (extract(day from month) = 1),
  lodged_on date not null,
  amount_cents bigint not null,
  reference text,
  created_at timestamptz not null default now()
);

create table activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  sale_id uuid references sales(id),
  agent_id uuid references agents(id),
  note text not null,
  happened_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  record_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create trigger settings_touch before update on settings for each row execute function touch_updated_at();
create trigger agents_touch before update on agents for each row execute function touch_updated_at();
create trigger clients_touch before update on clients for each row execute function touch_updated_at();
create trigger sales_touch before update on sales for each row execute function touch_updated_at();
create trigger consignments_touch before update on consignments for each row execute function touch_updated_at();
create trigger lots_touch before update on lots for each row execute function touch_updated_at();
create trigger charge_rates_touch before update on charge_rates for each row execute function touch_updated_at();

-- Every table locked to the owner of the database; nothing is readable through a public API by default.
do $$
declare t text;
begin
  foreach t in array array['settings','agents','clients','properties','sales','consignments','lots','charge_rates','account_sales',
    'account_sale_lines','buyer_invoices','receipts','levy_returns','activity','audit'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from public', t);
  end loop;
end $$;

create index lots_sale_idx on lots (sale_id);
create index lots_buyer_idx on lots (buyer_id);
create index consignments_sale_idx on consignments (sale_id);
create index consignments_vendor_idx on consignments (vendor_id);

-- ------------------------------------------------------------------ views

-- Every lot with its sale, vendor, buyer and dollars.
create view v_lots as
select l.id, l.lot_no, l.sale_id, s.name as sale, s.sale_date, s.kind as sale_kind, s.status as sale_status, s.source as sale_source,
  c.id as consignment_id, c.ref as consignment, c.species, c.description, l.category, l.head,
  c.vendor_id, v.name as vendor, vp.pic as vendor_pic, coalesce(vp.scheme, bp.scheme) as scheme,
  c.agent_id, a.name as agent,
  l.basis, l.weight_kg, case when l.weight_kg is not null then round(l.weight_kg / l.head, 0) end as avg_kg,
  l.price_cents, l.status, l.buyer_id, b.name as buyer, bp.pic as buyer_pic, coalesce(bp.is_processor, false) as to_processor,
  l.destination, l.sold_on, l.transfer_done_on, l.transfer_ref, l.nvd_sent_on, c.nvd_number,
  case when l.status = 'sold' then round(case l.basis when 'kg' then l.weight_kg * l.price_cents else l.head * l.price_cents end)::bigint end as gross_cents,
  case when l.status = 'sold' then round(case l.basis when 'kg' then l.weight_kg * l.price_cents else l.head * l.price_cents end / l.head, 2) end as per_head_cents
from lots l
join sales s on s.id = l.sale_id
join consignments c on c.id = l.consignment_id
join clients v on v.id = c.vendor_id
left join properties vp on vp.id = c.property_id
left join agents a on a.id = c.agent_id
left join clients b on b.id = l.buyer_id
left join properties bp on bp.id = l.buyer_property_id;

-- What each sold lot costs its vendor, charge by charge. The same query writes the account sale.
create view v_lot_charges as
select l.id as lot_id, l.sale_id, l.vendor_id, l.agent_id, l.species, l.head, r.code, r.label, r.kind, r.remit_to,
  round(case
    when r.basis = 'per_head' then l.head * r.amount
    when r.basis = 'per_lot' then r.amount
    when r.code = 'COMMISSION' then l.gross_cents * coalesce(v.commission_pct, st.commission_pct) / 100
    when r.min_price_cents_per_head is not null and l.per_head_cents < r.min_price_cents_per_head then 0
    when r.cap_cents_per_head is not null then l.head * least(l.per_head_cents * r.amount / 100, r.cap_cents_per_head)
    else l.gross_cents * r.amount / 100
  end)::bigint as amount_cents,
  r.gst
from v_lots l
join clients v on v.id = l.vendor_id
cross join settings st
join charge_rates r on r.active
  and (r.species is null or r.species = l.species)
  and (r.sale_kind is null or r.sale_kind = l.sale_kind)
  and (not r.saleyard_only or l.sale_kind not in ('private', 'online'))
where l.status = 'sold';

-- Write the account sales and buyer invoices for a sale, once every lot has a result.
create or replace function close_sale(p_sale uuid) returns int language plpgsql as $$
declare
  st settings%rowtype;
  s sales%rowtype;
  v record;
  b record;
  asid uuid;
  n int := 0;
begin
  select * into st from settings where id = 1;
  select * into s from sales where id = p_sale for update;
  if s.id is null then raise exception 'No such sale'; end if;
  if s.status = 'closed' then raise exception 'Sale % is already closed', s.name; end if;
  if exists (select 1 from lots where sale_id = p_sale and status = 'unsold') then
    raise exception 'Sale % still has lots with no result: sell, pass in or withdraw them first', s.name;
  end if;
  if not exists (select 1 from lots where sale_id = p_sale and status = 'sold') then
    raise exception 'Sale % has no sold lots', s.name;
  end if;

  for v in select l.vendor_id, sum(l.head)::int as head, sum(l.gross_cents)::bigint as gross,
             max(case when c.gst_registered then 1 else 0 end) as gst_reg
           from v_lots l join clients c on c.id = l.vendor_id
           where l.sale_id = p_sale and l.status = 'sold' group by l.vendor_id loop
    asid := gen_random_uuid();
    insert into account_sales (id, number, sale_id, vendor_id, head, gross_cents, gst_cents, charges_cents, net_cents, due_on)
    values (asid, 'AS-' || nextval('account_sale_seq'), p_sale, v.vendor_id, v.head, v.gross,
      case when v.gst_reg = 1 then round(v.gross * st.gst_pct / 100) else 0 end, 0, 0, s.sale_date + st.vendor_settle_days);
    insert into account_sale_lines (account_sale_id, lot_id, code, label, kind, head, amount_cents, gst_cents, remit_to)
    select asid, ch.lot_id, ch.code, ch.label, ch.kind, ch.head, ch.amount_cents,
      case when ch.gst then round(ch.amount_cents * st.gst_pct / 100) else 0 end, ch.remit_to
    from v_lot_charges ch where ch.sale_id = p_sale and ch.vendor_id = v.vendor_id and ch.amount_cents <> 0;
    update account_sales a set
      charges_cents = coalesce((select sum(amount_cents + gst_cents) from account_sale_lines where account_sale_id = asid), 0)
    where a.id = asid;
    update account_sales set net_cents = gross_cents + gst_cents - charges_cents where id = asid;
    n := n + 1;
  end loop;

  for b in select l.buyer_id, sum(l.head)::int as head, sum(l.gross_cents)::bigint as gross,
             sum(case when vc.gst_registered then round(l.gross_cents * st.gst_pct / 100) else 0 end)::bigint as gst,
             max(bc.terms_days) as terms
           from v_lots l join clients vc on vc.id = l.vendor_id join clients bc on bc.id = l.buyer_id
           where l.sale_id = p_sale and l.status = 'sold' group by l.buyer_id loop
    insert into buyer_invoices (number, sale_id, buyer_id, head, gross_cents, gst_cents, total_cents, due_on)
    values ('INV-' || nextval('buyer_invoice_seq'), p_sale, b.buyer_id, b.head, b.gross, b.gst, b.gross + b.gst,
      s.sale_date + coalesce(b.terms, st.buyer_terms_days));
  end loop;

  update sales set status = 'closed', closed_on = agency_today() where id = p_sale;
  return n;
end $$;

create view v_invoices as
select i.id, i.number, i.sale_id, s.name as sale, s.sale_date, i.buyer_id, c.name as buyer, i.head, i.total_cents,
  coalesce((select sum(r.amount_cents) from receipts r where r.invoice_id = i.id), 0)::bigint as paid_cents,
  i.total_cents - coalesce((select sum(r.amount_cents) from receipts r where r.invoice_id = i.id), 0)::bigint as balance_cents,
  i.due_on, greatest(0, agency_today() - i.due_on) as days_overdue
from buyer_invoices i join sales s on s.id = i.sale_id join clients c on c.id = i.buyer_id;

-- Each buyer's position: what they owe, how late, against their limit and their insurance.
create view v_debtors as
select c.id as buyer_id, c.name as buyer, c.credit_limit_cents, c.insured_until, c.on_stop,
  coalesce(sum(i.balance_cents), 0)::bigint as owing_cents,
  coalesce(sum(i.balance_cents) filter (where i.days_overdue = 0), 0)::bigint as current_cents,
  coalesce(sum(i.balance_cents) filter (where i.days_overdue between 1 and 14), 0)::bigint as overdue_1_14_cents,
  coalesce(sum(i.balance_cents) filter (where i.days_overdue between 15 and 30), 0)::bigint as overdue_15_30_cents,
  coalesce(sum(i.balance_cents) filter (where i.days_overdue > 30), 0)::bigint as overdue_30_plus_cents,
  max(i.days_overdue) filter (where i.balance_cents > 0) as worst_days
from clients c join v_invoices i on i.buyer_id = c.id
group by c.id, c.name, c.credit_limit_cents, c.insured_until, c.on_stop
having coalesce(sum(i.balance_cents), 0) > 0;

-- Every sold lot's NLIS or NAIT transfer. NAIT: an accredited saleyard records its own movements,
-- so only private, online and clearing sales carry the agent's 48 hours.
create view v_transfers as
select l.id as lot_id, l.sale, l.sale_date, l.sale_kind, l.lot_no, l.head, l.category, l.vendor, l.vendor_pic, l.buyer, l.buyer_pic,
  coalesce(l.scheme, case st.country when 'NZ' then 'NAIT' else 'NLIS' end) as scheme, l.sold_on,
  l.sold_on + st.transfer_days as due_on, l.transfer_done_on, l.transfer_ref,
  case
    when coalesce(l.scheme, case st.country when 'NZ' then 'NAIT' else 'NLIS' end) = 'NAIT' and l.sale_kind not in ('private', 'online', 'clearing') then 'saleyard records it'
    when l.transfer_done_on is not null and l.transfer_done_on <= l.sold_on + st.transfer_days then 'done'
    when l.transfer_done_on is not null then 'done late'
    when agency_today() > l.sold_on + st.transfer_days then 'overdue'
    else 'due'
  end as state
from v_lots l cross join settings st
where l.status = 'sold';

-- Account sales waiting to be paid to vendors.
create view v_settlements as
select a.id, a.number, s.name as sale, s.sale_date, c.name as vendor, a.head, a.gross_cents, a.charges_cents, a.net_cents, a.due_on, a.paid_on,
  greatest(0, agency_today() - a.due_on) as days_late
from account_sales a join sales s on s.id = a.sale_id join clients c on c.id = a.vendor_id;

-- Market report: what each category made at each sale.
create view v_market as
select l.sale_id, l.sale, l.sale_date, l.species, l.category, l.basis, count(*)::int as lots, sum(l.head)::int as head,
  round(sum(l.weight_kg) / nullif(sum(l.head) filter (where l.weight_kg is not null), 0), 0) as avg_kg,
  round(sum(l.weight_kg * l.price_cents) filter (where l.basis = 'kg') / nullif(sum(l.weight_kg) filter (where l.basis = 'kg'), 0), 1) as avg_c_per_kg,
  min(l.price_cents) filter (where l.basis = 'kg') as low_c_per_kg,
  max(l.price_cents) filter (where l.basis = 'kg') as top_c_per_kg,
  round(sum(l.gross_cents)::numeric / sum(l.head) / 100, 2) as avg_dollars_per_head,
  round(max(l.per_head_cents) / 100, 2) as top_dollars_per_head
from v_lots l where l.status = 'sold'
group by l.sale_id, l.sale, l.sale_date, l.species, l.category, l.basis;

-- Commission each agent brought in, from the account sales actually written.
create view v_agent_earnings as
select a.id as agent_id, a.name as agent, s.sale_date, s.name as sale, ln.amount_cents as commission_cents,
  round(ln.amount_cents * a.commission_share_pct / 100)::bigint as agent_share_cents, ln.head
from account_sale_lines ln
join account_sales acs on acs.id = ln.account_sale_id
join sales s on s.id = acs.sale_id
join lots l on l.id = ln.lot_id
join consignments c on c.id = l.consignment_id
join agents a on a.id = c.agent_id
where ln.kind = 'commission';

-- Levies held for the government, by month and species, against what was lodged.
create view v_levies as
select date_trunc('month', s.sale_date)::date as month, c.species, ln.code, ln.label, sum(ln.head)::int as head, sum(ln.amount_cents)::bigint as levy_cents
from account_sale_lines ln
join account_sales a on a.id = ln.account_sale_id
join sales s on s.id = a.sale_id
join lots l on l.id = ln.lot_id
join consignments c on c.id = l.consignment_id
where ln.kind = 'levy'
group by 1, 2, 3, 4;

-- Everything that needs a decision. severity 1 is today.
create view v_attention as
-- NVDs not in for stock booked into a sale in the next 7 days
select 1 as severity, 'NVD not in' as reason, s.name as ref, v.name as client,
  c.ref || ' ' || c.head_booked || ' ' || c.description || ', sale ' || s.sale_date as detail
from consignments c join sales s on s.id = c.sale_id join clients v on v.id = c.vendor_id
where s.status = 'booking' and s.sale_date between agency_today() and agency_today() + 7 and c.nvd_number is null
union all
select 1, 'lot not resulted', s.name, v.name, 'lot ' || l.lot_no || ', ' || l.head || ' ' || l.category || ', sale was ' || s.sale_date
from lots l join sales s on s.id = l.sale_id join consignments c on c.id = l.consignment_id join clients v on v.id = c.vendor_id
where l.status = 'unsold' and s.sale_date < agency_today()
union all
select 1, 'sale not closed', s.name, null, count(*) || ' lots sold ' || s.sale_date || ', no account sales yet'
from sales s join lots l on l.sale_id = s.id and l.status = 'sold'
where s.status = 'booking' and s.sale_date < agency_today()
group by s.name, s.sale_date
union all
select 1, 'transfer overdue', t.sale, t.vendor, t.scheme || ' lot ' || t.lot_no || ' to ' || coalesce(t.buyer, '') || ' was due ' || t.due_on
from v_transfers t where t.state = 'overdue'
union all
select 2, 'transfer due', t.sale, t.vendor, t.scheme || ' lot ' || t.lot_no || ' to ' || coalesce(t.buyer, '') || ' by ' || t.due_on
from v_transfers t where t.state = 'due'
union all
select 1, 'NVD copy to buyer late', l.sale, l.buyer, 'lot ' || l.lot_no || ' (' || l.vendor || ') sold ' || l.sold_on || ', NVD not sent'
from v_lots l cross join settings st
where l.status = 'sold' and coalesce(l.destination, 'restock') <> 'slaughter' and l.nvd_sent_on is null and agency_today() > l.sold_on + st.nvd_to_buyer_days
union all
select 1, 'vendor not paid', st.sale, st.vendor, st.number || ' net ' || round(st.net_cents / 100.0, 2) || ' was due ' || st.due_on
from v_settlements st where st.paid_on is null and st.due_on < agency_today()
union all
select 2, 'vendor payment due', st.sale, st.vendor, st.number || ' net ' || round(st.net_cents / 100.0, 2) || ' due ' || st.due_on
from v_settlements st where st.paid_on is null and st.due_on between agency_today() and agency_today() + 2
union all
select 1, 'buyer overdue', d.buyer, d.buyer, round(d.owing_cents / 100.0, 2) || ' owing, oldest ' || d.worst_days || ' days late'
from v_debtors d where d.worst_days > 0
union all
select 1, 'buyer over limit', d.buyer, d.buyer, round(d.owing_cents / 100.0, 2) || ' owing against a limit of ' || round(d.credit_limit_cents / 100.0, 2)
from v_debtors d where d.credit_limit_cents is not null and d.owing_cents > d.credit_limit_cents
union all
select 2, 'buyer cover lapsed', d.buyer, d.buyer, 'credit insurance ended ' || d.insured_until || ', ' || round(d.owing_cents / 100.0, 2) || ' owing'
from v_debtors d where d.insured_until is not null and d.insured_until < agency_today()
union all
select 1, 'sold to a buyer on stop', l.sale, l.buyer, 'lot ' || l.lot_no || ', ' || l.head || ' ' || l.category || ' sold ' || l.sold_on
from v_lots l join clients b on b.id = l.buyer_id
where b.on_stop and l.status = 'sold' and l.sold_on >= agency_today() - 14
union all
select 2, 'levy return not lodged', to_char(v.month, 'YYYY-MM'), null, round(sum(v.levy_cents) / 100.0, 2) || ' in levies held, no return recorded'
from v_levies v where v.month < date_trunc('month', agency_today())::date
  and not exists (select 1 from levy_returns r where r.month = v.month)
group by v.month
union all
select 3, 'vendor not booked this season', v.name, v.name,
  'sold ' || sum(c.head_booked) || ' head ' || to_char(min(s.sale_date), 'Mon YYYY') || ', nothing booked since'
from clients v join consignments c on c.vendor_id = v.id join sales s on s.id = c.sale_id cross join settings st
where s.sale_date between agency_today() - 400 and agency_today() - 300
  and not exists (select 1 from consignments c2 join sales s2 on s2.id = c2.sale_id where c2.vendor_id = v.id and s2.sale_date > agency_today() - st.quiet_after_days)
group by v.name;

-- The rules in docs/compliance.md, checked against the records. state: breached, due, clean.
create view v_compliance as
-- NLIS: stock off the agent code to the destination PIC within 2 days.
select 'NLIS-TRANSFER-2-DAYS' as rule,
  case when t.state = 'overdue' or t.state = 'done late' then 'breached' when t.state = 'due' then 'due' else 'clean' end as state,
  t.sale || ' lot ' || t.lot_no as item,
  t.head || ' head to ' || coalesce(t.buyer_pic, 'no PIC') || ', due ' || t.due_on || coalesce(', done ' || t.transfer_done_on, '') as detail
from v_transfers t where t.scheme = 'NLIS'
union all
-- NAIT: private, online and clearing sales recorded within 48 hours.
select 'NAIT-48-HOURS',
  case when t.state in ('overdue', 'done late') then 'breached' when t.state = 'due' then 'due' else 'clean' end,
  t.sale || ' lot ' || t.lot_no, t.head || ' head to ' || coalesce(t.buyer_pic, 'no NAIT number') || ', due ' || t.due_on
from v_transfers t where t.scheme = 'NAIT' and t.state <> 'saleyard records it'
union all
-- Every sold lot has its vendor declaration on file.
select 'NVD-ON-FILE', case when l.nvd_number is null then 'breached' else 'clean' end,
  l.sale || ' lot ' || l.lot_no, l.vendor || ', ' || l.head || ' ' || l.category || coalesce(', NVD ' || l.nvd_number, ', no NVD recorded')
from v_lots l where l.status = 'sold' and l.sale_source is null
union all
-- Stock to slaughter: the NVD goes with the stock or before it.
select 'NVD-TO-ABATTOIR',
  case when l.nvd_sent_on is null or l.nvd_sent_on > l.sold_on then 'breached' else 'clean' end,
  l.sale || ' lot ' || l.lot_no, l.head || ' ' || l.category || ' to ' || l.buyer || coalesce(', sent ' || l.nvd_sent_on, ', not sent')
from v_lots l where l.status = 'sold' and l.destination = 'slaughter' and l.scheme = 'NLIS'
union all
-- Other movements: a copy of the NVD to the buyer within 7 days.
select 'NVD-TO-BUYER-7-DAYS',
  case when l.nvd_sent_on is not null and l.nvd_sent_on <= l.sold_on + st.nvd_to_buyer_days then 'clean'
       when l.nvd_sent_on is not null or agency_today() > l.sold_on + st.nvd_to_buyer_days then 'breached' else 'due' end,
  l.sale || ' lot ' || l.lot_no, l.head || ' ' || l.category || ' to ' || l.buyer || ', due ' || (l.sold_on + st.nvd_to_buyer_days) || coalesce(', sent ' || l.nvd_sent_on, '')
from v_lots l cross join settings st where l.status = 'sold' and coalesce(l.destination, 'restock') <> 'slaughter' and l.scheme = 'NLIS'
union all
-- Transaction levies: every sold cattle, sheep and lamb lot on an account sale carries its levy.
select 'TRANSACTION-LEVY',
  case when exists (select 1 from account_sale_lines ln where ln.lot_id = l.id and ln.kind = 'levy') then 'clean'
       when exists (select 1 from v_lot_charges ch where ch.lot_id = l.id and ch.kind = 'levy' and ch.amount_cents = 0) then 'clean'
       else 'breached' end,
  l.sale || ' lot ' || l.lot_no, l.vendor || ', ' || l.head || ' ' || l.species
from v_lots l cross join settings st
where l.status = 'sold' and l.sale_status = 'closed' and l.sale_source is null and st.country = 'AU' and l.species in ('cattle', 'sheep', 'lambs')
union all
-- Levies held are lodged on a return.
select 'LEVY-RETURN', case when r.month is null then 'due' else 'clean' end, to_char(v.month, 'YYYY-MM'),
  round(sum(v.levy_cents) / 100.0, 2) || ' held' || coalesce(', lodged ' || r.lodged_on, ', no return recorded')
from v_levies v left join levy_returns r on r.month = v.month
where v.month < date_trunc('month', agency_today())::date
group by v.month, r.month, r.lodged_on
union all
-- Your policy: vendors paid by settlement day.
select 'VENDOR-SETTLEMENT',
  case when st.paid_on is null and st.due_on < agency_today() then 'breached' when st.paid_on > st.due_on then 'breached'
       when st.paid_on is null then 'due' else 'clean' end,
  st.number, st.vendor || ', net ' || round(st.net_cents / 100.0, 2) || ', due ' || st.due_on || coalesce(', paid ' || st.paid_on, '')
from v_settlements st where st.paid_on is null or st.sale_date >= agency_today() - 90;
