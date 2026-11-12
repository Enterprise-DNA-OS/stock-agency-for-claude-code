---
description: "One sale's summary: lots, head, sold, passed in, gross, and each vendor's gross and charges."
---
# Sale

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- sale "<sale>"
```

A series name ("Armidale Prime") means the latest one held; a date (2026-11-16) means the sale that day. If lots have no result, say so and offer /sale-day.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
