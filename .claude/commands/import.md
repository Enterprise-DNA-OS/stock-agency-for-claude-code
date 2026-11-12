---
description: "Bring clients and sale history across from AgriNous."
---
# Import

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- import agrinous <businesses.csv> --lots=<sale-lots.csv> [--date-order=dmy|mdy] [--open]
```

Read docs/replace-agrinous.md first. Always run without --apply first and show the summary, the columns not used and the skipped rows. If columns are missing, map them with the operator. Run with --apply only on a yes. Then run /clients and /attention.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
