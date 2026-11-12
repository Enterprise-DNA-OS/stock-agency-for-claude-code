---
description: "Month end: levies for the return, agent commission, vendor proceeds and buyer debtors."
---
# Month end

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- levies --month=<last month>
```

Then run `agents --from=<first of last month>`, `settlements` and `debtors`. Write one page: the levy figure for the return by species, commission by agent, anything unpaid either way. Offer /lodge-levy once the return is lodged.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
