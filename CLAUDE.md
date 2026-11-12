# Stock Agency for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR AGENCY], a stock and station agency selling cattle, sheep and lambs
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| One account sale: the vendor's lots, every charge, and net proceeds. | `/account-sale` |
| Account sales written: by sale, vendor or unpaid. | `/account-sales` |
| Add a client, a property (PIC or NAIT number), an agent, a sale or a charge. | `/add` |
| Commission each agent brought in, and their share. | `/agents` |
| Everything that needs a decision today: NVDs not in, sales not closed, transfers, vendors to pay, buyers overdue, levy returns. | `/attention` |
| Book a vendor's stock into a sale. | `/book` |
| Who is buying: head, spend, average c/kg and $/hd, by category. | `/buyers` |
| The sale catalogue: every lot in order with vendor, head, description, NVD and any treatment note. | `/catalogue` |
| One client: details, properties, what they sold and bought through you, what they owe, and notes. | `/client` |
| Clients: vendors, buyers or both, with their PICs and when they last sold or bought. | `/clients` |
| Close a sale: write the account sales and buyer invoices. | `/close` |
| Check the records against the rules in docs/compliance.md: NLIS and NAIT transfers, NVDs, transaction levies, vendor settlement. | `/compliance` |
| Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. | `/customise` |
| Buyers who owe: current, 1 to 14 days, 15 to 30, over 30, against their limit and their credit insurance. | `/debtors` |
| Render the paperwork: account sales, buyer invoices and market reports, in the agency's brand. | `/documents` |
| Draft a reminder to each buyer with an overdue invoice, or to one buyer. | `/draft-buyer-reminder` |
| Draft the market report for clients after a sale. | `/draft-market-report` |
| Draft a note to each vendor whose NVD is not in for a sale. | `/draft-nvd-chase` |
| Draft a vendor's results from a sale, with the day's averages, before the account sale goes out. | `/draft-vendor-results` |
| Export every table to CSV. | `/export` |
| Bring clients and sale history across from AgriNous. | `/import` |
| Buyer invoices: by buyer, by sale, or unpaid. | `/invoices` |
| Transaction levies held, by month and species, against the returns lodged. | `/levies` |
| Record that a month's levy return was lodged. | `/lodge-levy` |
| Note a call, visit or promise against a client. | `/log` |
| The market report: each category's head, average weight, average and range in c/kg or $/hd, and the change on the last sale. | `/market` |
| Month end: levies for the return, agent commission, vendor proceeds and buyer debtors. | `/month-end` |
| Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. | `/new-view` |
| Record a vendor declaration received for a booking. | `/nvd` |
| Record that the NVD copy went to the buyer (or with the stock to the abattoir). | `/nvd-sent` |
| Vendor declarations for the coming sales: which are in, which are missing, and any treatment notes. | `/nvds` |
| Pass in or withdraw a lot. | `/pass` |
| What comes off the vendor's cheque: commission, yard dues and transaction levies. | `/rates` |
| Record a buyer's payment against an invoice. | `/receipt` |
| A sale's results: every lot with weight, price, dollars a head, buyer and destination. | `/results` |
| One sale's summary: lots, head, sold, passed in, gross, and each vendor's gross and charges. | `/sale` |
| Enter the results from the auctioneer's sheet, lot by lot, then check every lot has a result. | `/sale-day` |
| The sales list: coming, recent or all, with head, lots sold and gross. | `/sales` |
| Record one lot's result: buyer, price and weight. | `/sell` |
| Change a client, agent, sale, charge or the agency's settings. | `/set` |
| Record that a vendor's proceeds were paid. | `/settle` |
| Vendor proceeds to pay, by settlement day. | `/settlements` |
| Split a lot into two before the sale (for example, drafting heifers off a mixed pen). | `/split` |
| Record that a transfer was done in the NLIS or NAIT database. | `/transfer` |
| NLIS and NAIT transfers still to record, overdue first. | `/transfers` |
| Vendor league: who sold the most through you, and at what average. | `/vendors` |
| Render the read-only dashboards: this week, money, compliance, market. | `/views` |
| The Monday review: attention, the sales in the next fortnight, last week's sales, money in and out, rules breached. | `/weekly-review` |

If an ask fits nothing here, run the CLI directly (`npm run <cli> -- --help`) and then propose a new command for it.

## How a sale runs here

1. **Booking.** `/book` each vendor's stock into the sale. Chase NVDs with `/nvds` and `/draft-nvd-chase` until none are NOT IN.
2. **Sale day.** `/sale-day` takes the results lot by lot: `sell`, `pass` or `withdraw`. Prices are cents a kilogram when sold by weight, dollars a head when sold by the head. Weight is the lot's total.
3. **Close.** `/close` (test run, then `--apply`) writes the account sales and buyer invoices. `npm run docs` prints them.
4. **After.** Transfers in the NLIS or NAIT database within the deadline, then `/transfer`. NVD copies to buyers, then `/nvd-sent`. Vendors paid on settlement day, then `/settle`. Buyers' money, `/receipt`. Month end, `/month-end` and `/lodge-levy`.

## Hard rules

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.
- Never change a closed sale's lots or account sales. A correction is a new record the operator approves.
- Recording a transfer, a payment or a levy return here is a record that it was done elsewhere. Only record it after the operator says it was done.
- Every rule in `/compliance` cites its source in `docs/compliance.md`. Never add or change a rule without one.

## Where things live

- `scripts/agency.mjs` the CLI (`npm run agency -- help`). `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off AgriNous.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/agrinous
