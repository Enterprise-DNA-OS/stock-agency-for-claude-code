---
description: "Record that a transfer was done in the NLIS or NAIT database."
---
# Transfer

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- transfer "<sale>" <lot> [--ref=<transfer id>] [--on=<date>]
npm run agency -- transfer "<sale>" --all
```

Only after the operator confirms it was done in the database. Then run /transfers to show what is left.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
