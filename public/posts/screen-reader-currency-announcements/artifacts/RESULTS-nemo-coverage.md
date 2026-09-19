# NeMo text-processing: currency coverage by language

Token = the language's table entry, classified by whether the normalised
output speaks the amount as money (M), names the symbol but reads the
amount digit-by-digit (S), does nothing currency-specific (T), errors (E),
or is unclassified (?). `none` = the language has no entry for that code.

| ISO | en | de | es | it | pt | sv | vi | zh | ko | hi | ar | hu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| USD | M | S | T | S | S | M | E | M | M | M | M | S |
| EUR | M | S | T | S | E | M | E | M | M | M | M | none |
| JPY | M | S | T | ? | none | M | E | M | M | M | M | none |
| GBP | M | S | M | S | E | M | E | M | none | M | M | S |
| CNY | none | none | T | none | none | none | S | M | none | none | none | none |
| AUD | none | none | T | none | none | M | S | M | none | none | none | none |
| CAD | T | none | T | T | none | M | S | M | M | none | M | none |
| CHF | T | T | T | T | none | M | S | M | M | none | M | none |
| HKD | M | T | T | T | none | M | S | M | M | none | M | none |
| SGD | none | none | T | none | none | M | S | M | none | none | none | none |
| KRW | M | S | T | none | none | M | E | M | M | M | M | none |
| INR | T | T | T | T | none | M | S | M | none | M | M | none |
| NZD | T | T | T | none | none | M | S | M | M | none | M | none |
| SEK | T | T | T | none | none | M | none | M | none | none | none | S |
| NOK | T | T | T | none | none | M | none | M | none | none | none | S |
| MXN | none | none | T | none | none | none | none | M | none | none | none | none |
| TWD | none | none | T | none | none | M | S | M | none | none | none | none |
| ZAR | none | none | T | none | none | none | none | M | none | none | none | none |
| BRL | T | none | T | none | S | M | none | M | none | none | none | none |
| THB | M | none | T | none | none | none | S | M | none | none | M | none |
| PLN | none | none | T | none | none | ? | none | M | none | none | none | none |
| DKK | T | T | T | none | none | M | none | M | none | none | M | none |
| IDR | none | none | T | none | none | none | S | M | none | none | none | none |
| HUF | none | none | T | none | none | none | none | M | none | none | none | S |
| CZK | T | T | T | none | none | M | none | M | none | none | none | none |
| ILS | none | none | T | none | none | none | none | M | none | none | none | none |
| CLP | none | none | T | none | none | none | none | M | none | none | none | none |
| PHP | T | none | T | none | none | none | S | M | none | none | none | none |
| AED | T | T | T | none | none | ? | none | M | M | none | M | none |
| COP | none | none | T | none | none | none | none | M | none | none | none | none |

## Category counts

| lang | money | symbol | text | error | unclassified |
|---|---|---|---|---|---|
| en | 7 | 0 | 17 | 0 | 0 |
| de | 0 | 5 | 13 | 0 | 0 |
| es | 1 | 0 | 104 | 0 | 0 |
| it | 0 | 3 | 4 | 0 | 1 |
| pt | 0 | 2 | 0 | 2 | 0 |
| sv | 23 | 0 | 0 | 0 | 2 |
| vi | 0 | 14 | 0 | 5 | 0 |
| zh | 81 | 0 | 0 | 0 | 0 |
| ko | 9 | 0 | 0 | 0 | 0 |
| hi | 6 | 0 | 0 | 0 | 0 |
| ar | 16 | 0 | 0 | 0 | 0 |
| hu | 0 | 5 | 0 | 0 | 0 |
