---
description: "Draft a note to each vendor whose NVD is not in for a sale."
---
# Draft nvd chase

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- draft-nvd-chase "<sale>"
```

One draft per vendor in drafts/. A person sends them.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
