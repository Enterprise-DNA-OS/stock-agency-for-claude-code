---
description: "Draft the market report for clients after a sale."
---
# Draft market report

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- draft-market-report "<sale>"
```

Show the draft. Edit wording on request. It is saved in drafts/; a person sends it.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
