---
description: "Buyers who owe: current, 1 to 14 days, 15 to 30, over 30, against their limit and their credit insurance."
---
# Debtors

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- debtors
```

Worst first. Say who is over their limit, whose cover has lapsed and who should go on stop. Offer /draft-buyer-reminder.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
