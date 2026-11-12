# Fixtures

Sample AgriNous exports for the import test and for trying the import before you run it on your own files.

- `agrinous/businesses.csv`: the shape of the Business Portal client list (three dots, Export CSV).
- `agrinous/sale-lots.csv`: the shape of a sale lots report saved as CSV from Sale Reports.

The column names here are examples. AgriNous reports differ by report and by agency, so the importer matches columns by the names listed in `scripts/lib/import.mjs` and tells you which columns it did not use. If yours are named differently, add the name to that list or ask Claude Code to map them.
