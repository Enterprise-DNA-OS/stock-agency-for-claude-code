# Moving off AgriNous

You can bring two things across in one sitting: your client list (with PICs) and your sale history (every lot, vendor, buyer, weight and price). You keep running AgriNous until you are happy, then stop.

## 1. Export from AgriNous

1. **Clients.** In AgriNous, open the Business Portal, click the three dots and choose Export CSV. Admin users can export businesses.
2. **Sale history.** Open Sale Reports for a sale, go to the Sale Export tab and click CSV next to the sale lots report. For many sales at once use the Multi Sale Report and choose CSV. Save the files somewhere you can find them.

Column names differ between reports and agencies. The importer matches each column by name (the lists are at the top of `scripts/lib/import.mjs`), tells you which columns it did not use, and skips rows it cannot read with the reason. If yours are named differently, add the name to the list or ask Claude Code to map them for you.

## 2. Test run, then import

```bash
npm run agency -- import agrinous ~/Downloads/businesses.csv --lots=~/Downloads/sale-lots.csv
```

That is a test run. Nothing is written. It prints how many clients, properties, sales and lots it would create, the columns it did not use, and any rows it skipped. Dates are read day first (05/08/2026 is 5 August); add `--date-order=mdy` if yours are month first.

When the numbers look right, run it again with `--apply`. Run it as often as you like: a client is matched by name or PIC, a lot by sale and lot number, so a second run updates and never duplicates.

## What maps

| AgriNous | Here |
|---|---|
| Business name, type, ABN, contact, email, mobile, town, state | `clients` (type Vendor, Buyer or Processor sets the kind) |
| PIC (or NAIT number, nine digits or more) | `properties` |
| Sale date, saleyard, sale name | `sales` (one per sale name, or saleyard and date) |
| Lot number, vendor, vendor PIC, head, description | `consignments` and `lots` |
| Total weight, price, price type (c/kg or $/hd) | `lots.weight_kg`, `lots.price_cents` (c/kg kept as is, $/hd stored as cents a head) |
| Buyer, buyer PIC | `lots.buyer_id`, `lots.buyer_property_id` |
| NVD number | `consignments.nvd_number` |
| Status (Sold, Passed In, No Sale) | `lots.status` |

## What does not carry over

- **Account sales and buyer invoices already issued.** They were written in AgriNous and posted to Xero; that is where they stay. Imported sales come in closed, as history: they feed the market report, the vendor and buyer history and the questions, and they are not judged against the record checks. Add `--open` to import a sale you have not closed yet, then close it here.
- **EIDs.** Individual tag numbers per animal stay in AgriNous and the NLIS database. This system works at the lot.
- **Bidder registrations, saleyard billing and the buyer portal.** These are AgriNous and YardNous screens, not records you need to keep.
- **Commission rates and charges.** Set your own in `charge_rates` (`/rates`) before you close your first sale here.

## The first week

1. Set your agency name, agent code, GST and settlement terms: `npm run agency -- set settings --business-name="..." --agency-code=... --vendor-settle-days=7`.
2. Check your charges: `/rates`. Change yard dues to your saleyard's, add any per-lot fees.
3. Add your agents and give each client their agent: `/add`, `/set`.
4. Book the next sale here (`/book`) and run it end to end alongside AgriNous.
