---
description: "NLIS and NAIT transfers still to record, overdue first."
---
# Transfers

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- transfers [--all]
```

Say which are past the 2 days (NLIS) or 48 hours (NAIT). The transfer itself is done in the NLIS or NAIT database; this records that it was done.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
