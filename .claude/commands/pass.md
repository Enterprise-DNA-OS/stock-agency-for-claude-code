---
description: "Pass in or withdraw a lot."
---
# Pass

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- pass "<sale>" <lot>
npm run agency -- withdraw "<sale>" <lot>
```

Offer to note it on the vendor (`/log`) and book the stock into the next sale.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
