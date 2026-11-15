# KAKAO signed notification balance — 2026-11-15

KAKAO push parser `1.0.1` separates an optional signed KRW post-balance from the
counterparty/product route. The notification's movement amount remains positive
and direction remains explicit IN/OUT. Missing balance remains supported;
malformed balance suffixes require Review rather than becoming counterparty text.

Admission accepts historical `1.0.0` evidence for the four supported banks and
`1.0.1` only for KAKAO. Package, parser key, ownership, currency, transfer windows,
source uniqueness and financial-meaning safeguards remain authoritative.

This release is future-only. It does not requeue terminal RAW, replace immutable
parse attempts, restore held observations or adjust account balances. Historical
cleanup requires a separate exact, fresh preview and owner authorization. A
deployment alone does not fix the historical latest parse of an old RAW.
