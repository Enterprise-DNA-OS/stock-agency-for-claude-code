---
description: "Draft a vendor's results from a sale, with the day's averages, before the account sale goes out."
---
# Draft vendor results

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- draft-vendor-results "<sale>" "<vendor>"
```

A person sends it.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
