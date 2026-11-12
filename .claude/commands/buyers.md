---
description: "Who is buying: head, spend, average c/kg and $/hd, by category."
---
# Buyers

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- buyers [--from=<date>] [--category=steers]
```

Answer questions like "who paid the most for heavy steers this spring" from this.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
