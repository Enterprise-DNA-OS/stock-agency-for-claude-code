---
description: "The market report: each category's head, average weight, average and range in c/kg or $/hd, and the change on the last sale."
---
# Market

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- market "<sale>"
```

Summarise the market in three lines an agent could read on the radio. Offer /draft-market-report.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
