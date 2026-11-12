---
description: "Render the paperwork: account sales, buyer invoices and market reports, in the agency's brand."
---
# Documents

Read CLAUDE.md first. Use fresh data and run:

```bash
npm run docs
npm run docs -- account-sale
npm run docs -- buyer-invoice
npm run docs -- market-report
```

Files land in docs-out/ using brand.json. Say which files were written. Print to PDF from the browser. Nothing is sent.

Answer in plain language, tables for numbers, in the agency's currency. Ambiguous names list the candidates and exit 1: ask which one. Never invent a lot, a price, a weight, a buyer, a payment or an NVD number. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database: drafts go to drafts/ and a person acts.
