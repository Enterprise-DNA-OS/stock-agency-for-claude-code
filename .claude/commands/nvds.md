---
description: "Vendor declarations for the coming sales: which are in, which are missing, and any treatment notes."
---
# Nvds

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- nvds [--days=14]
```

Missing NVDs first, with the vendor's phone. Offer /draft-nvd-chase for each sale with one missing.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
