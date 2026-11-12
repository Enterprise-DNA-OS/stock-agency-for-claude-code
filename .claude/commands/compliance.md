---
description: "Check the records against the rules in docs/compliance.md: NLIS and NAIT transfers, NVDs, transaction levies, vendor settlement."
---
# Compliance

Read CLAUDE.md and docs/compliance.md first. Use fresh data and run:

```bash
npm run agency -- compliance          # what to act on, then a count by rule
npm run agency -- compliance --all    # every check, clean ones too
```

Report as a table: rule, state, the item, the detail, the source from docs/compliance.md. Breached first, then due. For each breach, say the fix and the command: a transfer done in the NLIS database then recorded with /transfer, an NVD copy sent then recorded with /nvd-sent, a vendor paid then /settle, a levy return lodged then /lodge-levy.

If a rule in docs/compliance.md looks out of date (a levy rate changed, a state changed its transfer rule), say so and stop. Do not guess at law. The operator confirms the rule, then you update the doc and the check together with /customise.

Nothing here is legal advice. Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
