# Local bank statement verification

This read-only pipeline supports Kakao encrypted XLSX, IBK HTML stored as XLS,
and paginated Shinhan BIFF XLS, including merged layout cells and date-only
installment records. It never executes macros, evaluates formulas, uploads files,
or issues financial commands. Passwords remain in a restricted local environment
file. Originals and private snapshots must stay outside the repository.

Run with an owner-only temporary directory, approved Python dependencies and a
local configuration mapping each source file to a verified canonical owner account:

```text
python bank_pipeline.py --root <private-root> --config <private-bindings.json> --output <safe-output>
python analyze_local.py --root <private-root>
python -m unittest discover -s scripts/money-reconciliation -v
```

The configuration is an object keyed by an arbitrary account alias, with `file`,
`provider` (`KAKAO`, `IBK`, `SHINHAN`), `accountId`, and four-digit `suffix` fields.
The source manifest must cover every file before parsing. Binding suffixes are
verified against bank headers; the authenticated account provider must agree.
No account IDs, bank references or passwords belong in reusable configuration
examples committed to Git. For a future monthly statement, supply a new config
and owner-generated manifest; the adapters do not depend on filenames or month.

`analyze_local.py` expects authenticated, paginated owner snapshots saved as the
private baseline, ledger-pages and review-details JSON files. These reads are not
one atomic database snapshot. Candidate matching does not establish final cash
identity: unique time/sign/amount/account candidates still require source balance,
counterparty, transfer and owner-decision evidence. Date-only rows never become
invented midnight bank observations. Rows around an Android anchor are held for
source-time alignment, including paired loan lifecycle legs.

Kakao's nonstandard password-verifier variant is explicitly diagnosed. Exactly
the supplied password is tried; all decrypted ZIP CRCs, schema, original digest
and complete balance chain must validate. This proves a consistent decode, not
a bank signature or current balance. Wrong-password/garbage decoding fails closed.

Public evidence contains cryptographic source/row identifiers, canonical candidate
IDs, versions and diagnostic reasons, with no merchant text, account references,
secret values or raw records. Keep source rows in memory; encrypt any retained
private baseline and remove temporary decrypted extracts through permitted cleanup.

## Remote compatibility

The established IBK statement intake additionally accepts `HTML_XLS` after V118.
It remains `TABULAR_CONTINUITY_ONLY_HTML_XLS`: the existing corroborating PDF gate
is preserved for financial execution. Kakao and Shinhan are verified locally;
do not claim their controlled remote import/correction workflows are implemented.

`source_alignment.py --root <private-workspace>` optionally corroborates rows
against `restored-canonical-graph.private.json` from an owner-scoped, read-only
query of an independently verified local financial restore. It requires a
matching restore receipt/archive digest and reproduces all five authenticated
baseline ledger calculations before publishing clock diagnostics. The graph
contains account definitions, included/excluded facts, account-specific effective
posting times, original parsed-source associations, existing statement effects,
unlinked source candidates and checkpoints; keep it in the restricted workspace.

Corroboration requires account identity plus sign/amount/time and source balance,
canonical text, existing statement provenance or a confirmed transfer's bank
corroborated peer leg. Reused effects stay ambiguous. These are candidates for
owner review, with financial execution disabled. A canonical projection at a
bank second still uses the canonical posting clock; later Android delivery does
not establish a missing bank movement. Day-only statements never acquire an
invented second. The diagnostic is a backup snapshot, not a live bank check.

`money_get_bank_cutoff_projection` reads the canonical ledger at the requested
exact nonfuture instant. It returns its actual anchor, conflicting/unknown state,
boundary transaction versions, and a snapshot fingerprint. Its clock is canonical
effective posting time. It explicitly does not certify bank-time alignment or an
independent bank balance. Existing financial detail/read/write routes are preserved.

No checkpoint repair, bounded raw reprocessing, generic deletion, loan facility
rewrite, implicit transfer collapse or raw amount/time rewrite is enabled here.
All execution remains subject to the exact current owner-approved preview, CAS,
TTL, idempotency, source verification and durable outcome-recovery requirements.
