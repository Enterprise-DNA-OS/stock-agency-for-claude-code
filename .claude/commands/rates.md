---
description: "What comes off the vendor's cheque: commission, yard dues and transaction levies."
---
# Rates

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- rates
```

To change a rate: `npm run agency -- set rate <CODE> --amount=<n>`. To add one: `add rate`. A levy rate change cites its source in docs/compliance.md.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
