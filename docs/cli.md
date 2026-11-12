# The CLI

Every slash command runs one of these. `npm run agency -- help` prints the same list.

```
Stock Agency CLI

Reports (add --json for machine output):
  attention                          everything that needs a decision today
  compliance [--all]                 the rules in docs/compliance.md checked against the records
  sales [--upcoming | --all]         sale <sale>   catalogue <sale>   results <sale>   market <sale>
  nvds [--days=14]                   vendor declarations for the coming sales
  transfers [--all]                  NLIS and NAIT transfers to record
  account-sales [--sale --vendor --unpaid]   account-sale <AS-number>   settlements
  debtors                            invoices [--buyer --sale --unpaid]
  clients [--kind=vendor|buyer]      client <name or PIC>
  buyers [--from --category]         vendors [--from]   agents [--from]
  levies [--month=YYYY-MM]           rates   weekly-review

Actions:
  add client --name= [--kind --region --email --phone --agent --pic --nait --processor --terms --limit --commission --not-gst]
  add property <client> --pic= [--name --nait --state --processor]   add agent --name= [--branch --share]
  add sale --date= [--name --saleyard --kind=prime|store|weaner|stud|clearing|private|online --species=cattle|sheep|mixed]
  add rate --code --label --kind=commission|fee|levy --basis=pct|per_head|per_lot --amount [--species --cap --min-price --saleyard-only --no-gst --remit-to]
  set <client|agent|sale|rate|settings> [name] --field=value
  book <sale> <vendor> --head=N --description="" [--species --category --pic --agent --nvd --treatment --lot]
  nvd <consignment> --number=   split <sale> <lot> --head=N [--category]
  sell <sale> <lot> --buyer= --price= [--kg=TOTAL] [--basis=head] [--head --pic --destination=slaughter|restock|feedlot|export --on]
       price is cents per kg (402.5) when sold by weight, dollars per head (215.50) when sold by the head
  pass <sale> <lot>   withdraw <sale> <lot>
  transfer <sale> <lot | --all> [--on --ref]   nvd-sent <sale> <lot | --buyer= | --all> [--on]
  close <sale> [--apply]            account sales and buyer invoices (test run first)
  settle <AS-number> [--on --ref]   receipt <INV-number> [--amount --on --ref]   lodge-levy --month=YYYY-MM [--on --ref]
  log <client> --note= [--sale --agent --on]
  import agrinous <businesses.csv> [--lots=sale-lots.csv --date-order=dmy|mdy --open --apply]
  export [--dir=exports]
  draft-market-report <sale>   draft-nvd-chase <sale>   draft-buyer-reminder [buyer]   draft-vendor-results <sale> <vendor>
Drafts go to drafts/. Nothing here sends a message, moves money, lodges a levy return or records a transfer in the NLIS or NAIT database.
```
