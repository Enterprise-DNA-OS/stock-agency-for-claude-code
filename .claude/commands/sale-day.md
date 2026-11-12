---
description: "Enter the results from the auctioneer's sheet, lot by lot, then check every lot has a result."
---
# Sale day

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- catalogue "<sale>"
```

Take the results as the operator gives them (a pasted sheet, a photo transcribed by the operator, or lot by lot). For each sold lot run `npm run agency -- sell "<sale>" <lot> --buyer="<buyer>" --price=<c/kg> --kg=<total kg>` (by the head: `--basis=head --price=<dollars a head>`). Passed in: `pass`. Withdrawn: `withdraw`. Read each line back before running it. When done, run `results` and then offer /close. If a buyer is on stop, stop and say so.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
