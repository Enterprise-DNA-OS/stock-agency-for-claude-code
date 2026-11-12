---
description: "Vendor league: who sold the most through you, and at what average."
---
# Vendors

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- vendors [--from=<date>]
```

Point out vendors who sold last season and have not booked (they are in /attention).

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
