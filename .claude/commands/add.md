---
description: "Add a client, a property (PIC or NAIT number), an agent, a sale or a charge."
---
# Add

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- add client --name="<name>" [--kind=vendor|buyer|both] [--pic=<PIC>] [--nait]
add property "<client>" --pic=<PIC>
add agent --name=
add sale --date=<date> --saleyard=<yard> [--kind --species]
add rate ...
```

Check /clients first so the same business is not added twice.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
