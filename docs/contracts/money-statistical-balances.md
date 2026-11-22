# MONEY statistical balances

`GET /api/money/v4/statistical-balances` uses the earlier of `asOf` (current time if omitted) and the final PostgreSQL microsecond of the selected `to` date in Asia/Seoul. `accountIds` is an optional comma-separated scope. The account's effective tracking, fund subtype and statistical inclusion at that cutoff determine membership. The ORBIT MCP tool `money_get_statistical_balances` calls the same read with the explicitly requested period, `currency`, `accountIds` and optional `cutoff` (the Web API calls it `asOf`).

| Confidence | Meaning |
| --- | --- |
| `VERIFIED` | An eligible observation establishes the balance at the cutoff. Check `source` for bank versus owner evidence. |
| `ESTIMATED` | A dated anchor plus canonical signed movements in `(basisAt, asOfCutoff]` matches continuous statement coverage. |
| `UNKNOWN` | The account, currency, membership, anchor, source coverage, movement or time evidence is insufficient. |
| `CONFLICT` | Same-time observations disagree or independent and ledger figures disagree. The reason and an available signed difference accompany the result. |

Provider notifications require a registered, non-excluded canonical leg, compatible amount and direction, verified push format and account provenance. Owner observations and checkpoints are explicitly identified. An owner-attested native statement can establish an exact ending observation and coverage between its bank rows when the rows have second-level precision. Bank PDF coverage is bounded by the declared KST period and the last bank row for an unclosed statement day. Missing source links, mismatched canonical movements, unresolved transfer legs, day-precision cutoff ambiguity and scoped pending notifications block extrapolation. An observed amount at an earlier date and an empty ledger interval alone leave coverage unproven.

New clients render `displayBalance`, `displayDifference`, `displayTotal`, `verifiedSubtotal` and `estimatedSubtotal` as exact decimal strings or null. `displayable` states whether the member balance can be rendered. `basisAt` and `source` identify the anchor separately from `observedAt`, `bankObservedAt` and `asOfCutoff`. A complete group with at least one estimate has `ESTIMATED` confidence. If any member or relevant membership is unresolved, `displayTotal` is null. `knownCount`, `estimatedCount`, `unknownCount`, `conflicts` and `membershipUnknownCount` explain the coverage. A conflicting member is included in `unknownCount`. `unresolved[].possibleGroups` identifies which groups an unresolved account can affect.

Legacy `known` and `knownCount` mean verified. Legacy numeric `total` is available only for a complete verified group, and `confirmedPartialSum` contains verified members only. Legacy `balance` and `difference` remain numeric. Exact zero and disambiguated negative balances are valid values. The reads perform no financial writes.
