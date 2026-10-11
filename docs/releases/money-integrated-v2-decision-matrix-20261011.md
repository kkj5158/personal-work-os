# MONEY Integrated V2 — decision coverage evidence

Date: 2026-10-11 (Asia/Seoul). Source: the owner-approved final review package
`MONEY_INTEGRATED_FINAL_REVIEW_20261011`, particularly
`02_DECISION_REGISTER_001-053_KO.md`, `DECISION_051_KO.md` and
`DECISIONS_052_053_KO.md`. Package examples and synthetic screenshots are design
references, not proof of production behavior or additional authorization.

Implementation inspected at root integration commit `602a001` plus subsequent
review fixes. **Every row below means implementation evidence exists; root
integration, DB and browser validation are pending unless the root release
report explicitly records their results.** This matrix does not claim release,
PROD deployment, applied migrations or external AI execution.

Evidence abbreviations refer to repository paths:

| Code | Implementation evidence |
|---|---|
| MONTH | `frontend/app/money/MoneyMonthlySummary.tsx`, `MoneyBookkeeping.tsx::SavingsLedger`, `frontend/lib/money/monthly.ts`, `backend/src/main/java/com/kafka/backend/money/MoneySavingsReadService.java` |
| HISTORY | `backend/src/main/resources/db/migration/V80__money_account_fund_group_history.sql`, `MoneyAnalysis.java`, `MoneyAccountManagementService.java`, `MoneyService.java`, `MoneyMobileService.java` |
| ACCOUNT | `frontend/app/money/MoneyAccountRevision.tsx`, `money-account-v2.css`, `frontend/lib/money/accounts.ts`, existing `MoneyWebViews.tsx::AccountIcon` |
| WORK | `frontend/app/money/MoneyBookkeepingRecommendations.tsx`, `MoneyBookkeeping.tsx`, `money-bookkeeping-recommendations.css`, `frontend/lib/money/workbench.ts`, `backend/src/main/java/com/kafka/backend/money/MoneyRecommendationService.java` |
| CHOICE | `backend/src/main/resources/db/migration/V81__money_classification_draft_choices.sql`, `MoneyRecommendationService.java`, `MoneyRecommendationController.java` |
| REVIEW | `frontend/app/money/MoneyNotificationReview.tsx`, `money-notification-review.css`, `backend/src/main/java/com/kafka/backend/money/MoneyReviewBatchService.java`, `MoneyReviewBatchController.java`; existing `MoneyAiService`, `MoneyReviewService`, financial commands |
| NAV | `frontend/app/money/MoneyApp.tsx`, `MoneyFinancialViews.tsx`, `frontend/app/money/[[...view]]/page.tsx` |

The implementation contract for accounts is also recorded in
`docs/contracts/money-account-v2.md`. Relative paths above are navigational
references within the repository; their symbols and existence were inspected.

| ID | Approved behavior | Implementation evidence | Root verification still required |
|---|---|---|---|
| 001 | Keep net savings; remove withdrawal-return meaning/linking; classify real transfer boundary | MONTH savings contributions; HISTORY temporal endpoints | General→savings plus, reverse minus, savings→savings zero; negative net |
| 002 | Four monthly KPIs, equal size, net subtly emphasized | MONTH KPI grid: income/expense/gross/net | Desktop four columns and financial totals |
| 003 | Three larger interactive composition donuts | MONTH donut components and chart-to-ledger filtering | Layout size, clicks and unfiltered KPI retention |
| 004 | Donut center always retains its whole-month total | MONTH `Donut` receives whole-period total separately from selection | Click category/account and compare center vs selection detail |
| 005 | Income/expense parent-child exploration and table filtering | MONTH category aggregation/root state/filter callback | Parent, child, back and reset behavior |
| 006 | Remove savings purpose categories/default purpose/purpose selection | MONTH account-based savings; ACCOUNT subtype only | No purpose-selection flow added; income/expense categories intact |
| 007 | Savings composition by receiving account, excluding internal moves | MONTH composition + savings ledger `accountId` | Deposit-only account drill-down and internal-transfer exclusion |
| 008 | Workbench category popover supports simple creation only | WORK category picker/create, existing category management reused | New category immediately selectable without saving transaction |
| 009 | Fund/type changes affect occurrence times after the effective point | HISTORY baseline and server-time append; temporal SQL joins | Before/after change, late-arriving old transactions, subtype history |
| 010 | One review list with row-specific reasons/actions | REVIEW integrated table | Mixed raw/financial obligations, detail routing |
| 011 | Bulk selection grouped by supported command, preview/exclusion/conflicts/partial failure | REVIEW durable preview, command groups and per-item transaction outcomes | Mixed eligibility, stale versions, no duplicate replay |
| 012 | Workbench top workflow plus row outcomes/progress; unknown-result recovery | WORK stages/activity/pending request IDs; CHOICE | Per-item save success/failure/conflict/unknown with drafts retained |
| 013 | Independent top-level statistics/AI analysis menu | NAV analysis entry and bounded placeholder | Independent navigation, no unapproved detailed analytics |
| 014 | Remove recommendation/re-recommendation controls from Review | REVIEW notification-only UI; WORK classification hub | No AI classification actions on the review screen |
| 015 | Minimal notification cleanup first; preserve financial ambiguity safeguards | REVIEW supports information dismissal/defer/reopen; stricter bulk gate | Ambiguous financial messages stay excluded from information cleanup |
| 016 | Account list plus right settings panel | ACCOUNT cards; NAV existing dock wiring | Selection and desktop list/detail layout |
| 017 | Living / savings-installment / other groups, savings/installment subtypes | ACCOUNT `groupedFundAccounts`, persisted group/subtype | Exactly three groups without purpose taxonomy |
| 018 | Group cards, header totals, collapse/expand, selected detail | ACCOUNT card group/collapse state | Collapse retains selection and correct group subtotal |
| 019 | Balanced account identity, institution, subtype, balance, key status | ACCOUNT card fields + preserved AccountIcon | Card density, custom icons and state visibility |
| 020 | Basic info / fund group / management in one settings page | ACCOUNT `RevisionAccountPanel` sections | No extra tabs required to manage settings |
| 021 | Per-field alias/independent saves; confirm financial impacts; server acknowledgement | ACCOUNT `run`/versioned metadata-preserving updates | No optimistic completed indicator; errors retain draft |
| 022 | Top-level add changes the panel to creation with duplicate check/cancel | ACCOUNT creation form, `/mobile/accounts` | Add/cancel/selection return and duplicates incl archived accounts |
| 023 | Minimum name/provider/group/subtype and preserved financial identity | ACCOUNT create inputs; HISTORY atomic initial group insertion | No pre-registration tracking/representative form; correct initial group |
| 024 | Hide archived by default; restore; delete only unreferenced accounts | ACCOUNT scope/archive; management eligibility/delete service | Every reference blocks deletion; archive leaves financial history intact |
| 025 | Account shortcut opens existing transaction screen with account filter | ACCOUNT shortcut; NAV `FinancialTransactions` query routing | Exact selected account filter, including archived account history |
| 026 | Account shortcut opens balance inspection for selected account | ACCOUNT `/money/reconciliation?account=` | Exact selected-account reconciliation and original commands |
| 027 | Fixed group order; preserve existing within-group order | ACCOUNT `groupedFundAccounts` | API order unaffected by new group UI; no new sorting API |
| 028 | Confirmed same-currency subtotal; unknown values explicitly excluded | ACCOUNT stock unsupported-currency gate and balance `asOf` | Mixed currency, missing anchors and unavailable stock loading |
| 029 | Group/subtype/role/tracking/assets/representatives remain independent with caps | ACCOUNT isolated payloads; existing tracking/preferences endpoints | Changing one axis leaves other metadata intact; 5/5/10 caps |
| 030 | New effective-point confirmation/history; compare latest state on conflict | ACCOUNT group confirmation/latest-version comparison; HISTORY | Stale group save and unrelated concurrent metadata save |
| 031 | Desktop two-column layout; narrow-screen detail flow with draft/selection retention | ACCOUNT responsive cards; NAV existing dock/dirty guard | Mobile detail, close/navigation guard and typed draft preservation |
| 032 | Distinguish empty/loading/refresh/save/error/conflict/unknown currency/balance states | ACCOUNT `LoadState`, errors/latest comparison and empty groups | API failures do not blank the account screen; recovery works |
| 033 | Account management reuses transaction/balance financial screens | ACCOUNT shortcuts; existing reconciliation/editor actions | No duplicated transaction table in the account settings panel |
| 034 | Retain dense 8-column ledger/editing; add 4 KPIs/3 donuts/filtering | MONTH; WORK keeps original bookkeeping columns | Existing income/expense editing and raw financial contracts |
| 035 | Workbench is recommendation/classification center with preview/recovery/simple creation | WORK; CHOICE; existing classification commands | Single hub, distinct recommendation/adoption/save actions |
| 036 | Review cleanup supports page vs full-filter selection, preview/history/recovery | REVIEW server-frozen scope and persisted request results | 51+ rows, excluded financial items, undo support and partial failures |
| 037 | No withdrawal-return/purpose UI/DTO/state introduced by V2 | MONTH boundary adapter; ACCOUNT subtype-only form | No new return-linkage or savings-purpose flows; other refunds/loans intact |
| 038 | Preserve existing menus/contracts; bounded independent analysis entry | NAV preserves overview/transactions/loans/categories/settings/reconciliation | Navigation regression and analysis scope copy |
| 039 | Default work-needed list, optional all, hidden selected IDs visible | WORK view/filter controls and hidden count | Completed rows excluded by default; optional full view |
| 040 | Status summary cards offer quick filters | WORK server summary and cards | Counts correspond to their filter scope, separate from monthly KPIs |
| 041 | Compact search-first filters with collapsed account/type details | WORK bookkeeping workbench filters | Search/expanded filter controls and unchanged selected IDs |
| 042 | Page selection differs from all-filter-pages; hidden IDs retained | WORK page/filter commands and server ID selection | Paginated selection, filter changes and hidden counts |
| 043 | Fixed ONE/SELECTED/FILTER preview with eligibility/cost/request protection | WORK run preview; existing recommendation server guards | Charged execution gate, immutable scope and protected states |
| 044 | Current / original AI / explicit choice shown separately | WORK `RecommendationCategory`/evidence panel; CHOICE | Original AI revision unchanged by user selection |
| 045 | Single/bulk adoption creates choice only; explicit save confirms | WORK `adopt`→`choose`; CHOICE; save preview | Adoption does not mutate classification/financial facts |
| 046 | Category selection/simple creation only; advanced management elsewhere | WORK picker + category management route | Create/choose without implicit transaction save |
| 047 | Visible workflow, selected/hidden counts, progress and row outcomes | WORK stage controls and activity rendering | Ongoing requests keep usable table and status visibility |
| 048 | Retry known failures; unknown uses original outcome; preserve conflicts/drafts | WORK pending-start/save IDs and result lookup; server replay guards | Unknown transport outcomes never become duplicate new requests |
| 049 | Evidence panel opens explicitly; context/question/history separated | WORK `RecommendationPanel`, tabs and `onOpen` handlers | No automatic evidence dock; context edits do not become chat messages |
| 050 | Existing bright style/dense ledger; responsive local table scroll/overlay | WORK stylesheet; existing responsive dock/nav | Desktop/narrow screenshots, scrolling and focus handling |
| 051 | Four freely accessible stages with guided transitions and row primary action | WORK stages 1–4, `workbenchAction`, retained independent choice selection | Stage switching, direct choice→save, adoption→save, explicit panel |
| 052 | Classification-save preview modal: counts, eligible/excluded comparison tables, explicit save | WORK `SavePreview` + common preview dialog; server save eligibility | Count identity, 0-ready disabled, row outcomes, no financial/learning mutation |
| 053 | AI-run preview modal: fixed scope, counts, eligible/excluded tables, protection/cost gates | WORK run preview + common dialog; existing server recommendation policy | Execute guard equals preview policy; icon metadata preserved; responsive policy text |

Targeted evidence already available from the account worker: 8 account helper
tests passed, 4 account lifecycle Java tests passed, scoped account ESLint passed.
The standalone account typecheck reported only the existing missing generated
Next `LayoutProps`; root must perform integration type/build validation with its
generated types. Other workers' tests and the root's final DB/browser runs must
be cited by their own recorded reports rather than inferred from source code.

Relevant root suites to complete include `MoneySavingsReadPostgresTest`,
`MoneyMobilePostgresTest`, `MoneyAccountHistoryPostgresTest`,
`MoneyReviewBatchPostgresTest`, classification recommendation persistence tests,
and `qa/suites/money-integrated-v2/v2.spec.mjs`. These filenames are test targets,
not a claim that they have been executed or passed.
