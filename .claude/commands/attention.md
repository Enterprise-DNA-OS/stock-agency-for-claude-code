---
description: "Everything that needs a decision today: NVDs not in, sales not closed, transfers, vendors to pay, buyers overdue, levy returns."
---
# Attention

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run agency -- attention
```

Group by reason, most urgent first. For each, say the next action and the command that does it (/draft-nvd-chase, /close, /transfer, /settle, /draft-buyer-reminder, /lodge-levy). A buyer on stop who bought stock is said first.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
