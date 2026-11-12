# Why there is no front end

AgriNous is a database with a subscription. The records underneath it are ordinary: clients and their PICs, sales, consignments, lots, account sales, invoices and transfers. What you pay for is the layer on top that lets people who do not write queries get at those records: screens for booking, resulting, printing and reporting.

That layer used to be the whole product, because talking to a database was hard. It is not hard any more. Open this folder in Claude Code, say what you want ("what did the heavy steers average on Monday", "who still owes for September"), and it runs the query and explains the answer. Ask a question the vendor never built a report for and you still get an answer.

## What you gain

- **Better answers.** A report shows what the vendor decided to report. Here you ask your own question, in your own words, against your own sales.
- **No seats.** Every agent, the office and the accountant can look. The bill does not grow with headcount or head sold.
- **Your data in your Postgres.** Plain tables. Back them up, query them from anything, leave any time.
- **A process that matches you.** When the way you run a sale changes, you add a command or a column. You do not wait for a release.

## What you give up

- **Saleyard hardware.** AgriNous scans EIDs at the yards and links to the NLIS database in real time. This works at the lot: the transfer is done in the NLIS or NAIT database and recorded here. Enterprise DNA builds the connection where an agency wants it.
- **A phone app at the rail.** It runs where Claude Code runs: a laptop in the office, or a phone through Claude on the web. Results can be read off the auctioneer's sheet after the sale.
- **The buyer and vendor portals.** Buyers and vendors get documents and emails, drafted here and sent by a person.
- **A vendor help desk.** This is open source. Enterprise DNA supports the installed version for agencies that want someone to call.

## Who this fits

Independent stock and station agencies, from two agents to forty, who want their sale records in a database they own and answers they can ask for. If your team needs a screen at the rail all day, keep that screen and let this hold the records and the questions.

Installed and run for you: https://enterprisedna.co/omni/instead-of/agrinous
