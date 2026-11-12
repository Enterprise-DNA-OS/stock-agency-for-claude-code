---
description: "Close a sale: write the account sales and buyer invoices."
---
# Close

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- close "<sale>"
```

Run it without --apply first and show what each vendor would get. On the operator's yes run it again with --apply, then `npm run docs -- account-sale` and `npm run docs -- buyer-invoice` to render the paperwork. A closed sale cannot be changed here: corrections are a credit or a new account sale, written by hand.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
