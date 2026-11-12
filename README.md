<h1 align="center">Stock Agency for Claude Code</h1>

<p align="center">
  <strong>The open-source livestock agency system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your AgriNous data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=agrinous">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/agrinous?utm_source=github&utm_medium=readme&utm_campaign=agrinous">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-agrinous">Instead of AgriNous</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Stock Agency for Claude Code does the job you pay AgriNous for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the AgriNous dashboard cannot.

AgriNous publishes no price for AgentNous: an agency books a walkthrough and is quoted ([agrinous.com.au/agentnous](https://agrinous.com.au/agentnous), checked 12 November 2026). It is the platform most Australian saleyards run on (Beef Central reported it serving 65 percent of national saleyard throughput in August 2024), so an independent agency pays whatever that quote is, every year, for software it cannot take its records out of on its own terms.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=agrinous).

It is built for independent stock and station agencies: two to forty people selling cattle, sheep and lambs through saleyards, paddock sales and online, in New South Wales, Victoria, Queensland or New Zealand. It holds your clients and their PICs (or NAIT numbers), the sales you run, every consignment and lot, the buyers, and what comes off each vendor's cheque. It writes the account sales and buyer invoices when a sale closes, tracks every NLIS and NAIT transfer against its deadline, chases the NVDs before the sale, totals the transaction levies for your return, and tells you which buyers owe and which vendors are owed.

## Ten questions AgriNous does not answer out of the box

1. What did each category average at Monday's sale, and how did that move on the sale before? `/market`
2. Which vendors sold with us this time last year and have not booked this season? `/attention`
3. Which buyers paid the most a kilo for steers this spring? `/buyers`
4. Which buyers are over their credit limit, or still owe after their insurance cover lapsed? `/debtors`
5. Which NLIS transfers are past their 2 days, and which NAIT movements past 48 hours? `/transfers`
6. Whose NVDs are still not in for next Monday's sale, and which mob has a treatment inside its withholding period? `/nvds`
7. How much in transaction levies do we hold for last month, by species, and has the return gone in? `/levies`
8. What commission did each agent bring in this quarter, and what is their share? `/agents`
9. Which vendors are owed proceeds past settlement day? `/settlements`
10. Who were our top vendors this season by gross, and what did they average a head? `/vendors`

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/stock-agency-for-claude-code.git
cd stock-agency-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. The demo is a three-agent agency on the New England tablelands of NSW with eleven prime cattle sales, three sheep and lamb sales, a store sale and a paddock sale on the books, and a morning's worth of problems: three NVDs not in for next week's sales, Monday's sale not closed, NLIS transfers two days late, Kentucky Station's proceeds from last week not paid, a feedlot over its credit limit, a buyer on stop who bought a pen of steers anyway, and last month's levy return not lodged.

## Your first hour: ten things to ask for

1. "What needs me today?" (`/attention`)
2. "Whose NVDs aren't in for Monday? Draft them a note." (`/nvds`, `/draft-nvd-chase`)
3. "Book 24 Angus steers from Glen Morrison into Monday's sale." (`/book`)
4. "Here are the results off the sheet." (`/sale-day`)
5. "What did the heavy steers average, and draft the market report." (`/market`, `/draft-market-report`)
6. "Close Monday's sale and print the account sales." (`/close`, `/documents`)
7. "Which transfers are still to do?" (`/transfers`)
8. "Who owes us, and how late?" (`/debtors`)
9. "What levies do we owe for October?" (`/levies`)
10. "Add a transit insurance charge of 0.1% on every lot." (`/customise`)

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/account-sale` | One account sale: the vendor's lots, every charge, and net proceeds. |
| `/account-sales` | Account sales written: by sale, vendor or unpaid. |
| `/add` | Add a client, a property (PIC or NAIT number), an agent, a sale or a charge. |
| `/agents` | Commission each agent brought in, and their share. |
| `/attention` | Everything that needs a decision today: NVDs not in, sales not closed, transfers, vendors to pay, buyers overdue, levy returns. |
| `/book` | Book a vendor's stock into a sale. |
| `/buyers` | Who is buying: head, spend, average c/kg and $/hd, by category. |
| `/catalogue` | The sale catalogue: every lot in order with vendor, head, description, NVD and any treatment note. |
| `/client` | One client: details, properties, what they sold and bought through you, what they owe, and notes. |
| `/clients` | Clients: vendors, buyers or both, with their PICs and when they last sold or bought. |
| `/close` | Close a sale: write the account sales and buyer invoices. |
| `/compliance` | Check the records against the rules in docs/compliance.md: NLIS and NAIT transfers, NVDs, transaction levies, vendor settlement. |
| `/customise` | Make this system yours in plain language. Add a field, rename stages, change a rule, add a column to a document. Writes the migration, applies it, updates the commands that touch it. |
| `/debtors` | Buyers who owe: current, 1 to 14 days, 15 to 30, over 30, against their limit and their credit insurance. |
| `/documents` | Render the paperwork: account sales, buyer invoices and market reports, in the agency's brand. |
| `/draft-buyer-reminder` | Draft a reminder to each buyer with an overdue invoice, or to one buyer. |
| `/draft-market-report` | Draft the market report for clients after a sale. |
| `/draft-nvd-chase` | Draft a note to each vendor whose NVD is not in for a sale. |
| `/draft-vendor-results` | Draft a vendor's results from a sale, with the day's averages, before the account sale goes out. |
| `/export` | Export every table to CSV. |
| `/import` | Bring clients and sale history across from AgriNous. |
| `/invoices` | Buyer invoices: by buyer, by sale, or unpaid. |
| `/levies` | Transaction levies held, by month and species, against the returns lodged. |
| `/lodge-levy` | Record that a month's levy return was lodged. |
| `/log` | Note a call, visit or promise against a client. |
| `/market` | The market report: each category's head, average weight, average and range in c/kg or $/hd, and the change on the last sale. |
| `/month-end` | Month end: levies for the return, agent commission, vendor proceeds and buyer debtors. |
| `/new-view` | Add a read-only HTML view (a dashboard page) from a plain-language description, rendered in the operator's brand by `npm run view`. |
| `/nvd` | Record a vendor declaration received for a booking. |
| `/nvd-sent` | Record that the NVD copy went to the buyer (or with the stock to the abattoir). |
| `/nvds` | Vendor declarations for the coming sales: which are in, which are missing, and any treatment notes. |
| `/pass` | Pass in or withdraw a lot. |
| `/rates` | What comes off the vendor's cheque: commission, yard dues and transaction levies. |
| `/receipt` | Record a buyer's payment against an invoice. |
| `/results` | A sale's results: every lot with weight, price, dollars a head, buyer and destination. |
| `/sale` | One sale's summary: lots, head, sold, passed in, gross, and each vendor's gross and charges. |
| `/sale-day` | Enter the results from the auctioneer's sheet, lot by lot, then check every lot has a result. |
| `/sales` | The sales list: coming, recent or all, with head, lots sold and gross. |
| `/sell` | Record one lot's result: buyer, price and weight. |
| `/set` | Change a client, agent, sale, charge or the agency's settings. |
| `/settle` | Record that a vendor's proceeds were paid. |
| `/settlements` | Vendor proceeds to pay, by settlement day. |
| `/split` | Split a lot into two before the sale (for example, drafting heifers off a mixed pen). |
| `/transfer` | Record that a transfer was done in the NLIS or NAIT database. |
| `/transfers` | NLIS and NAIT transfers still to record, overdue first. |
| `/vendors` | Vendor league: who sold the most through you, and at what average. |
| `/views` | Render the read-only dashboards: this week, money, compliance, market. |
| `/weekly-review` | The Monday review: attention, the sales in the next fortnight, last week's sales, money in and out, rules breached. |

## Instead of AgriNous

Export your client list from the Business Portal and your sale lots from Sale Reports, both as CSV, then:

```bash
npm run agency -- import agrinous businesses.csv --lots=sale-lots.csv           # test run, writes nothing
npm run agency -- import agrinous businesses.csv --lots=sale-lots.csv --apply   # bring it across
```

Clients are matched by name or PIC and lots by sale and lot number, so you can run it again without duplicates. Account sales already issued stay in AgriNous and Xero; your sale history comes across for the market, vendor and buyer questions. The full guide, with what maps and what does not: [docs/replace-agrinous.md](docs/replace-agrinous.md).

## Compliance built in

`/compliance` checks the records against the rules the agency works under, each with its source in [docs/compliance.md](docs/compliance.md): NLIS transfers off the agent code within 2 days (NSW), NAIT movements within 48 hours (NZ), the NVD on file, to the abattoir with the stock and to other buyers within 7 days, the cattle, sheep and lamb transaction levies on every account sale, the monthly levy return, and vendors paid by settlement day.

## Documents and views

`npm run docs` renders the account sale for each vendor, the tax invoice for each buyer and the market report for each sale as HTML in your brand (`brand.json`: name, logo, colours). Print to PDF from the browser. `npm run view` renders read-only dashboards: the week, money in and out, compliance and the market.

## Architecture

```
stock-agency-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/agency.mjs        the CLI the commands drive (npm run agency -- help)
  scripts/lib/import.mjs    the AgriNous import
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Stock Agency for Claude Code for your business, migrates your AgriNous data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=agrinous)
- Read more: [enterprisedna.co/omni/instead-of/agrinous](https://enterprisedna.co/omni/instead-of/agrinous?utm_source=github&utm_medium=readme&utm_campaign=agrinous)

## License

MIT. Copyright (c) 2026 Enterprise DNA.
