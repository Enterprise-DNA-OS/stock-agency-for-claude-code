-- Demo data: a three-agent livestock agency on the New England tablelands of NSW.
-- Ten weeks of Monday prime cattle sales, fortnightly sheep and lamb sales, a monthly store sale,
-- a private paddock sale, and one prime sale from this time last year.
-- Every date is relative to agency_today(), so the demo always has a sale to close, transfers overdue,
-- NVDs missing for next week's sale, a vendor not paid, buyers overdue and a levy return to lodge.
-- Idempotent: a second run does nothing.
do $$
declare
  t date;
  a_tom uuid; a_kate uuid; a_ben uuid;
  cattle_vendors uuid[] := '{}';
  sheep_vendors uuid[] := '{}';
  processors uuid[] := '{}';
  feedlots uuid[] := '{}';
  restockers uuid[] := '{}';
  sheep_buyers uuid[] := '{}';
  sheep_restock uuid;
  agents_arr uuid[];
  v record;
  sid uuid; cid uuid; lid uuid; buyer uuid; vend uuid; ag uuid;
  k int; i int; n int; hd int; kg numeric; price numeric; cat text; dest text; sp text; sdate date; sname text;
  cats text[] := array['steers','heifers','cows','vealers','steers','bullocks','heifers','cows'];
  kgs numeric[] := array[410, 380, 540, 260, 450, 640, 400, 560];
  cpk numeric[] := array[402, 368, 318, 455, 396, 352, 372, 312];
  scat text[] := array['lambs','lambs','ewes','lambs','wethers','lambs','ewes','lambs'];
  sprice numeric[] := array[21500, 19800, 13800, 23600, 14900, 18400, 12600, 20700];
  hillview uuid;
  inv record;
begin
  if exists (select 1 from clients where name = 'Kentucky Station') then return; end if;
  t := agency_today();

  update settings set business_name = 'Tablelands Stock and Station Agents', agency_code = 'NE00AG77', currency = 'AUD', country = 'AU', gst_pct = 10,
    commission_pct = 4, vendor_settle_days = 7, buyer_terms_days = 7, transfer_days = 2, nvd_to_buyer_days = 7 where id = 1;

  insert into agents (name, branch, phone, email, commission_share_pct) values ('Tom Gleeson', 'Armidale', '0428 551 203', 'tom@example.com.au', 50) returning id into a_tom;
  insert into agents (name, branch, phone, email, commission_share_pct) values ('Kate Darcy', 'Armidale', '0417 330 918', 'kate@example.com.au', 45) returning id into a_kate;
  insert into agents (name, branch, phone, email, commission_share_pct) values ('Ben Moloney', 'Guyra', '0439 772 140', 'ben@example.com.au', 40) returning id into a_ben;
  agents_arr := array[a_tom, a_kate, a_ben];

  insert into charge_rates (code, label, kind, basis, amount, species, cap_cents_per_head, min_price_cents_per_head, saleyard_only, gst, remit_to) values
    ('COMMISSION', 'Selling commission', 'commission', 'pct', 4, null, null, null, false, true, null),
    ('YARD-DUES-CATTLE', 'Yard dues', 'fee', 'per_head', 1150, 'cattle', null, null, true, true, 'Saleyard operator'),
    ('YARD-DUES-SHEEP', 'Yard dues', 'fee', 'per_head', 95, 'sheep', null, null, true, true, 'Saleyard operator'),
    ('YARD-DUES-LAMBS', 'Yard dues', 'fee', 'per_head', 95, 'lambs', null, null, true, true, 'Saleyard operator'),
    ('CATTLE-LEVY', 'Cattle transaction levy', 'levy', 'per_head', 500, 'cattle', null, null, false, false, 'Department of Agriculture levies'),
    ('SHEEP-LEVY', 'Sheep transaction levy', 'levy', 'pct', 2, 'sheep', 20, 500, false, false, 'Department of Agriculture levies'),
    ('LAMB-LEVY', 'Lamb transaction levy', 'levy', 'pct', 2, 'lambs', 150, 500, false, false, 'Department of Agriculture levies');

  -- Cattle vendors: name, district, agent, PIC
  for v in select * from (values
    ('Kentucky Station', 'Uralla', 1, 'NA401122', 3.5::numeric),
    ('Glen Morrison', 'Guyra', 3, 'NA401187', null),
    ('Dangarsleigh Pastoral', 'Armidale', 1, 'NA401203', null),
    ('Wollun Grazing', 'Walcha', 2, 'NA401266', null),
    ('Ebor Highlands Cattle Co', 'Ebor', 2, 'NA401301', null),
    ('Bundarra Downs', 'Bundarra', 1, 'NA401349', null),
    ('Sarah and Pete Lyle', 'Guyra', 3, 'NA401377', null),
    ('Mihi Creek Partnership', 'Uralla', 2, 'NA401412', null),
    ('Black Mountain Angus', 'Black Mountain', 3, 'NA401455', null),
    ('Rob Hensley', 'Kingstown', 1, 'NA401490', null)
  ) as x(name, region, ag, pic, comm) loop
    insert into clients (name, kind, region, contact, phone, email, gst_registered, agent_id, commission_pct)
    values (v.name, 'vendor', v.region, split_part(v.name, ' ', 1), '04' || lpad((10000000 + length(v.name) * 7919)::text, 8, '0'),
      lower(regexp_replace(v.name, '[^A-Za-z]+', '.', 'g')) || '@example.com.au', v.name <> 'Rob Hensley', agents_arr[v.ag], v.comm)
    returning id into cid;
    insert into properties (client_id, name, pic, scheme, state) values (cid, v.region || ' home block', v.pic, 'NLIS', 'NSW');
    cattle_vendors := cattle_vendors || cid;
  end loop;

  -- Sheep vendors
  for v in select * from (values
    ('Gostwyck Merinos', 'Uralla', 2, 'NA402011'),
    ('Salisbury Plains Partnership', 'Uralla', 1, 'NA402054'),
    ('Hall and Daughters', 'Walcha', 2, 'NA402098'),
    ('Thalgarrah Sheep Co', 'Armidale', 3, 'NA402133'),
    ('Rockvale Lamb', 'Rockvale', 1, 'NA402170')
  ) as x(name, region, ag, pic) loop
    insert into clients (name, kind, region, gst_registered, agent_id, email)
    values (v.name, 'vendor', v.region, true, agents_arr[v.ag], lower(regexp_replace(v.name, '[^A-Za-z]+', '.', 'g')) || '@example.com.au') returning id into cid;
    insert into properties (client_id, name, pic, scheme, state) values (cid, v.region || ' woolshed block', v.pic, 'NLIS', 'NSW');
    sheep_vendors := sheep_vendors || cid;
  end loop;

  -- Buyers: processors (slaughter), feedlots, restockers, lamb buyers
  for v in select * from (values
    ('Northern Tablelands Meats', 'processor', 'NA900101', 30, 60000000::bigint, 7),
    ('Coastal Beef Processors', 'processor', 'NA900144', 30, 50000000, 7),
    ('Kelvale Feedlot', 'feedlot', 'NA900210', 14, 15000000, 7),
    ('Dumaresq Feedlot', 'feedlot', 'NA900255', 20, 20000000, 7),
    ('Jim Halloran', 'restock', 'NA900301', 7, 3000000, 7),
    ('Bellevue Grazing', 'restock', 'NA900333', 7, 4000000, 7),
    ('Sandon Pastoral', 'restock', 'NA900372', 7, 2500000, 7),
    ('Highfields Lamb Co', 'sheepproc', 'NA900411', 14, 25000000, 7),
    ('Riverina Lamb Exporters', 'sheepproc', 'NA900455', 14, 30000000, 7),
    ('Mount Mitchell Merinos', 'sheeprestock', 'NA900490', 7, 2000000, 7)
  ) as x(name, role, pic, terms, lim, nothing) loop
    insert into clients (name, kind, region, gst_registered, terms_days, credit_limit_cents, insured_until, email)
    values (v.name, 'buyer', 'New England', true, v.terms, v.lim, t + 200, lower(regexp_replace(v.name, '[^A-Za-z]+', '.', 'g')) || '@example.com.au') returning id into cid;
    insert into properties (client_id, name, pic, scheme, state, is_processor)
    values (cid, v.name || ' main', v.pic, 'NLIS', 'NSW', v.role in ('processor', 'sheepproc'));
    if v.role = 'processor' then processors := processors || cid;
    elsif v.role = 'feedlot' then feedlots := feedlots || cid;
    elsif v.role = 'restock' then restockers := restockers || cid;
    elsif v.role = 'sheepproc' then sheep_buyers := sheep_buyers || cid;
    else sheep_restock := cid; end if;
  end loop;
  -- Kelvale's limit is tight on purpose; Bellevue's cover has lapsed; Sandon is on stop.
  update clients set credit_limit_cents = 9000000 where name = 'Kelvale Feedlot';
  update clients set insured_until = t - 20 where name = 'Bellevue Grazing';
  update clients set on_stop = true, notes = 'On stop until the September invoice is cleared.' where name = 'Sandon Pastoral';

  -- A vendor who sold with us this time last year and has not booked since.
  insert into clients (name, kind, region, gst_registered, agent_id, email) values ('Hillview Pastoral', 'vendor', 'Walcha', true, a_kate, 'hillview@example.com.au') returning id into hillview;
  insert into properties (client_id, name, pic, scheme, state) values (hillview, 'Hillview', 'NA401533', 'NLIS', 'NSW');

  ------------------------------------------------------------------ prime cattle sales
  -- k = 0 is this time last year; k = 1 was Monday (sold, not closed); k = 2..10 closed.
  for k in 0..10 loop
    sdate := case when k = 0 then t - 368 else t - 3 - 7 * (k - 1) end;
    sname := 'Armidale Prime ' || sdate;
    insert into sales (name, sale_date, saleyard, kind, species) values (sname, sdate, 'Armidale', 'prime', 'cattle') returning id into sid;
    n := case when k = 0 then 6 else 10 + (k % 3) end;
    for i in 1..n loop
      vend := case when k = 0 and i <= 2 then hillview else cattle_vendors[1 + ((i * 7 + k * 3) % array_length(cattle_vendors, 1))] end;
      cat := cats[1 + ((i + k) % 8)];
      hd := 4 + ((i * 5 + k) % 14);
      kg := hd * (kgs[1 + ((i + k) % 8)] + ((i * 11 + k * 5) % 30) - 15);
      price := cpk[1 + ((i + k) % 8)] + ((i * 13 + k * 7) % 40) - 20 - case when k = 0 then 25 else 0 end;
      if cat in ('cows', 'bullocks') then buyer := processors[1 + ((i + k) % 2)]; dest := 'slaughter';
      elsif cat = 'vealers' then buyer := case when i % 2 = 0 then processors[1 + (k % 2)] else restockers[1 + ((i + k) % 3)] end;
        dest := case when i % 2 = 0 then 'slaughter' else 'restock' end;
      elsif (i + k) % 3 = 0 then buyer := restockers[1 + ((i * 2 + k) % 3)]; dest := 'restock';
      else buyer := feedlots[1 + ((i + k) % 2)]; dest := 'feedlot'; end if;
      -- Sandon is on stop: keep them out of history, then sell them a lot on Monday by mistake.
      if buyer = restockers[3] and not (k = 1 and i = 3) then buyer := restockers[1]; end if;
      if k = 1 and i = 3 then buyer := restockers[3]; dest := 'restock'; cat := 'steers'; end if;
      select id into cid from consignments where sale_id = sid and vendor_id = vend;
      if cid is null then
        insert into consignments (ref, sale_id, vendor_id, property_id, agent_id, species, description, head_booked, nvd_number, nvd_received_on)
        select 'C-' || nextval('consignment_ref_seq'), sid, vend, p.id, c.agent_id, 'cattle', 'Mixed cattle', hd,
          'NVD' || lpad((7700000 + k * 100 + i)::text, 8, '0'), sdate - 3
        from clients c left join properties p on p.client_id = c.id where c.id = vend limit 1
        returning id into cid;
      else
        update consignments set head_booked = head_booked + hd where id = cid;
      end if;
      update consignments set description = initcap(cat) || case when cat in ('steers', 'heifers') then ', yearling, grass fed' else '' end
        where id = cid and description = 'Mixed cattle';
      insert into lots (sale_id, consignment_id, lot_no, head, category, basis, weight_kg, price_cents, status, buyer_id, buyer_property_id, destination, sold_on,
        transfer_done_on, transfer_ref, nvd_sent_on)
      values (sid, cid, i::text, hd, cat, 'kg', kg, price, 'sold', buyer, (select id from properties where client_id = buyer limit 1), dest, sdate,
        sdate + 1, 'NLIS-' || to_char(sdate, 'YYMMDD') || '-' || i, case when dest = 'slaughter' then sdate else sdate + 2 end);
    end loop;
    -- One lot passed in at most sales.
    if k between 1 and 6 then
      select id into cid from consignments where sale_id = sid order by ref limit 1;
      insert into lots (sale_id, consignment_id, lot_no, head, category, basis, status) values (sid, cid, (n + 1)::text, 3, 'cows', 'kg', 'passed_in');
    end if;
    if k <> 1 then perform close_sale(sid); end if;
  end loop;

  -- Monday's sale: two transfers not done (due yesterday), the rest done; NVD copies to restockers not yet sent.
  update lots l set transfer_done_on = null, transfer_ref = null
  from sales s where s.id = l.sale_id and s.name = 'Armidale Prime ' || (t - 3) and l.lot_no in ('3', '7');
  update lots l set nvd_sent_on = null from sales s where s.id = l.sale_id and s.name = 'Armidale Prime ' || (t - 3) and l.destination <> 'slaughter';

  -- Last week's sale: one restock lot's NVD copy never went to the buyer.
  update lots l set nvd_sent_on = null
  from sales s where s.id = l.sale_id and s.name = 'Armidale Prime ' || (t - 10)
    and l.id = (select l2.id from lots l2 where l2.sale_id = s.id and l2.destination in ('restock', 'feedlot') order by l2.lot_no::int limit 1);

  ------------------------------------------------------------------ sheep and lamb sales
  for k in 1..3 loop
    sdate := t - 14 * k;
    sname := 'Armidale Sheep and Lamb ' || sdate;
    insert into sales (name, sale_date, saleyard, kind, species) values (sname, sdate, 'Armidale', 'prime', 'sheep') returning id into sid;
    for i in 1..8 loop
      vend := sheep_vendors[1 + ((i * 3 + k) % array_length(sheep_vendors, 1))];
      cat := scat[1 + ((i + k) % 8)];
      sp := case when cat = 'lambs' then 'lambs' else 'sheep' end;
      hd := 40 + ((i * 17 + k * 9) % 120);
      price := sprice[1 + ((i + k) % 8)] + ((i * 300 + k * 700) % 2400) - 1200;
      if cat = 'lambs' or (i % 2 = 0) then buyer := sheep_buyers[1 + ((i + k) % 2)]; dest := 'slaughter';
      else buyer := sheep_restock; dest := 'restock'; end if;
      select id into cid from consignments where sale_id = sid and vendor_id = vend and species = sp;
      if cid is null then
        insert into consignments (ref, sale_id, vendor_id, property_id, agent_id, species, description, head_booked, nvd_number, nvd_received_on)
        select 'C-' || nextval('consignment_ref_seq'), sid, vend, p.id, c.agent_id, sp,
          case when sp = 'lambs' then 'Crossbred lambs, trade weight' else 'Merino ' || cat end, hd,
          'SNVD' || lpad((5500000 + k * 100 + i)::text, 8, '0'), sdate - 2
        from clients c join properties p on p.client_id = c.id where c.id = vend returning id into cid;
      else
        update consignments set head_booked = head_booked + hd where id = cid;
      end if;
      insert into lots (sale_id, consignment_id, lot_no, head, category, basis, price_cents, status, buyer_id, buyer_property_id, destination, sold_on, transfer_done_on, transfer_ref, nvd_sent_on)
      values (sid, cid, i::text, hd, cat, 'head', price, 'sold', buyer, (select id from properties where client_id = buyer limit 1), dest, sdate,
        sdate + 1, 'NLIS-S' || to_char(sdate, 'YYMMDD') || '-' || i, case when dest = 'slaughter' then sdate else sdate + 3 end);
    end loop;
    perform close_sale(sid);
  end loop;

  ------------------------------------------------------------------ the monthly store sale
  sdate := t - 27;
  insert into sales (name, sale_date, saleyard, kind, species) values ('Guyra Store ' || sdate, sdate, 'Guyra', 'store', 'cattle') returning id into sid;
  for i in 1..9 loop
    vend := cattle_vendors[1 + ((i * 3) % array_length(cattle_vendors, 1))];
    cat := case when i % 2 = 0 then 'weaner heifers' else 'weaner steers' end;
    hd := 12 + (i * 7) % 30;
    buyer := case when i % 3 = 0 then feedlots[2] else restockers[1 + (i % 2)] end;
    insert into consignments (ref, sale_id, vendor_id, property_id, agent_id, species, description, head_booked, nvd_number, nvd_received_on)
    select 'C-' || nextval('consignment_ref_seq'), sid, vend, p.id, c.agent_id, 'cattle', initcap(cat) || ', Angus, weaned and drenched', hd,
      'NVD' || lpad((8800000 + i)::text, 8, '0'), sdate - 4
    from clients c join properties p on p.client_id = c.id where c.id = vend
    on conflict do nothing returning id into cid;
    insert into lots (sale_id, consignment_id, lot_no, head, category, basis, weight_kg, price_cents, status, buyer_id, buyer_property_id, destination, sold_on, transfer_done_on, transfer_ref, nvd_sent_on)
    values (sid, cid, i::text, hd, cat, 'kg', hd * (235 + (i * 9) % 50), 470 + (i * 17) % 80 - case when i % 2 = 0 then 40 else 0 end, 'sold', buyer,
      (select id from properties where client_id = buyer limit 1), case when buyer = feedlots[2] then 'feedlot' else 'restock' end, sdate, sdate + 1, 'NLIS-G' || i, sdate + 3);
  end loop;
  perform close_sale(sid);

  ------------------------------------------------------------------ a private paddock sale last week
  sdate := t - 6;
  insert into sales (name, sale_date, kind, species, notes) values ('Paddock sale Wollun to Halloran ' || sdate, sdate, 'private', 'cattle', 'Sold on farm, weighed off truck at Walcha.') returning id into sid;
  insert into consignments (ref, sale_id, vendor_id, property_id, agent_id, species, description, head_booked, nvd_number, nvd_received_on)
  select 'C-' || nextval('consignment_ref_seq'), sid, c.id, p.id, c.agent_id, 'cattle', 'Angus cows with calves at foot, PTIC', 24, 'NVD07710555', sdate
  from clients c join properties p on p.client_id = c.id where c.name = 'Wollun Grazing' returning id into cid;
  insert into lots (sale_id, consignment_id, lot_no, head, category, basis, price_cents, status, buyer_id, buyer_property_id, destination, sold_on)
  select sid, cid, '1', 24, 'cows and calves', 'head', 245000, 'sold', c.id, p.id, 'restock', sdate
  from clients c join properties p on p.client_id = c.id where c.name = 'Jim Halloran';

  ------------------------------------------------------------------ the next sales, booking now
  sdate := t + 4;
  insert into sales (name, sale_date, saleyard, kind, species) values ('Armidale Prime ' || sdate, sdate, 'Armidale', 'prime', 'cattle') returning id into sid;
  for i in 1..7 loop
    vend := cattle_vendors[1 + ((i * 3 + 1) % array_length(cattle_vendors, 1))];
    cat := cats[1 + (i % 8)];
    hd := 6 + (i * 5) % 12;
    insert into consignments (ref, sale_id, vendor_id, property_id, agent_id, species, description, head_booked, nvd_number, nvd_received_on, treatment_note)
    select 'C-' || nextval('consignment_ref_seq'), sid, vend, p.id, c.agent_id, 'cattle', initcap(cat) || case when cat in ('steers', 'heifers') then ', yearling' else '' end, hd,
      case when i in (2, 5) then null else 'NVD' || lpad((9900000 + i)::text, 8, '0') end, case when i in (2, 5) then null else t - 1 end,
      case when i = 4 then 'Backlined 9 days before sale: check the ESI before any export buyer bids' end
    from clients c join properties p on p.client_id = c.id where c.id = vend
    on conflict do nothing returning id into cid;
    if cid is not null then
      insert into lots (sale_id, consignment_id, lot_no, head, category, basis) values (sid, cid, i::text, hd, cat, 'kg') on conflict do nothing;
    end if;
    cid := null;
  end loop;

  sdate := t + 7;
  insert into sales (name, sale_date, saleyard, kind, species) values ('Armidale Sheep and Lamb ' || sdate, sdate, 'Armidale', 'prime', 'sheep') returning id into sid;
  for i in 1..4 loop
    vend := sheep_vendors[i];
    insert into consignments (ref, sale_id, vendor_id, property_id, agent_id, species, description, head_booked, nvd_number, nvd_received_on)
    select 'C-' || nextval('consignment_ref_seq'), sid, vend, p.id, c.agent_id, 'lambs', 'Second cross lambs, shorn', 60 + i * 25,
      case when i = 3 then null else 'SNVD' || lpad((6600000 + i)::text, 8, '0') end, case when i = 3 then null else t end
    from clients c join properties p on p.client_id = c.id where c.id = vend returning id into cid;
    insert into lots (sale_id, consignment_id, lot_no, head, category, basis) values (sid, cid, i::text, 60 + i * 25, 'lambs', 'head');
  end loop;

  ------------------------------------------------------------------ money in and out
  -- Vendors paid on settlement day, except last week's Kentucky Station cheque.
  update account_sales a set paid_on = a.due_on, paid_ref = 'EFT ' || a.number
  where a.due_on <= t and not (a.sale_id = (select id from sales where name = 'Armidale Prime ' || (t - 10)) and a.vendor_id = cattle_vendors[1]);

  -- Buyers pay within terms, except: Kelvale has not paid last week; Bellevue has not paid for what it bought five or six weeks ago;
  -- Northern Tablelands Meats part-paid last week.
  for inv in select i.*, c.name as buyer, s.sale_date from buyer_invoices i join clients c on c.id = i.buyer_id join sales s on s.id = i.sale_id loop
    if inv.buyer = 'Kelvale Feedlot' and inv.sale_date >= t - 17 then continue; end if;
    if inv.buyer = 'Bellevue Grazing' and inv.sale_date between t - 45 and t - 31 then continue; end if;
    if inv.due_on > t then continue; end if;
    if inv.buyer = 'Northern Tablelands Meats' and inv.sale_date = t - 10 then
      insert into receipts (invoice_id, amount_cents, received_on, reference) values (inv.id, inv.total_cents / 2, inv.due_on, 'EFT part');
      continue;
    end if;
    insert into receipts (invoice_id, amount_cents, received_on, reference) values (inv.id, inv.total_cents, inv.due_on - (inv.total_cents % 3)::int, 'EFT');
  end loop;

  -- Levy returns lodged for every month before last; last month's is still to do.
  insert into levy_returns (month, lodged_on, amount_cents, reference)
  select lv.month, (lv.month + interval '1 month' + interval '20 days')::date, sum(lv.levy_cents), 'Return ' || to_char(lv.month, 'YYYY-MM')
  from v_levies lv where lv.month < (date_trunc('month', t) - interval '1 month')::date group by lv.month;

  insert into activity (client_id, agent_id, note, happened_on)
  select c.id, c.agent_id, n.note, t - n.ago from (values
    ('Kentucky Station', 'Rang about the cheque from last Monday. Said it would be in on Friday.', 1),
    ('Bellevue Grazing', 'Left a message about the September invoice.', 9),
    ('Hillview Pastoral', 'Sold 2 pens of steers with us last November. Not heard since.', 300)
  ) as n(name, note, ago) join clients c on c.name = n.name;
end $$;
