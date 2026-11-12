---
description: "Book a vendor's stock into a sale."
---
# Book

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- book "<sale>" "<vendor>" --head=<n> --description="<description>" [--category=steers] [--nvd=<number>] [--treatment="<note>"] [--pic=<PIC>]
```

Ask for head, description and category if they were not given. If the NVD is not in, say so and offer /draft-nvd-chase.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
