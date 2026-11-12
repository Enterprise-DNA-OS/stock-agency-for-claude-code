---
description: "Record one lot's result: buyer, price and weight."
---
# Sell

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- sell "<sale>" <lot> --buyer="<buyer>" --price=<c/kg> --kg=<total kg> [--destination=slaughter|restock|feedlot|export] [--pic=<buyer PIC>]
```

Price is cents a kilogram when sold by weight (402.5), dollars a head when sold by the head (`--basis=head --price=215.50`). Weight is the lot's total. Read back head, price and gross before saying it is done. A warning about a buyer on stop or a missing PIC goes to the operator straight away.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
