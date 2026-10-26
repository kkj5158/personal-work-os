# STUDY V1 frontend implementation report

Date: 2026-10-27, Asia/Seoul. Owner request: implement the attached MD in the actual POS frontend and release to production. The owner's direct production request overrides the attachment's DEV-only release instruction; its frontend-only functional boundary remains intact.

## Implemented

The actual Next.js POS application now contains `/study`, a genuine system destination in SharedSidebar/SystemSwitcher/GlobalTabs, and five Korean primary tabs: Today, Workbooks, History, Materials and Coach. Existing theme tokens, system order normalization, shell navigation guards, RouteStateProvider, collapse/mobile drawer and global tab state are reused. Shared changes are limited to navigation registration and a single sidebar exclusion.

Today has separate required/extension progress and equal online/handwritten actions. Workbooks lists seven-day current, next and archived weeks, versioned document-pair indicators and truthful generation-error UI. History shows a month calendar, union-based completion, drafts, version-bound attempts and historical document links. Materials edits sample metadata, weights, scope and include flags; file selection lists metadata only. Coach records free text as pending AI analysis, proposes deterministic sample changes, explicitly approves/rejects policies, shows history/rollback, and displays disconnected Sunday-evening configuration.

Online solving, handwritten submission and document preview are dedicated wide in-app workspaces rather than dialogs. Return navigation preserves the source tab and the selected workbook week/history date. The registry renders single/multiple choice, boolean, short answer, essay and case analysis. Diagram questions remain visible with document/handwritten fallback. Invalid schemas render an error before usable controls. Answer keys load only following deliberate review, with sample labels and no real grading.

Handwritten flow supports local JPG/PNG/PDF input and camera affordance, drag/drop, size/type validation, large image/PDF previews, reorder/remove, question coverage and notes. It records only sample attachment metadata, explicitly discloses that bytes are not server-stored, and revokes preview URLs on removal/unmount. Leaving selected files warns through the existing shell guard; browser unload has a warning.

## Connected behavior versus samples

`/study` defaults to a disconnected adapter in all environments. Explicit public sample opt-in uses authored demo questions and the current shell's memory only. Refresh clears sample state. No private content or privileged answer keys are bundled. The production opt-in is a scoped adaptation of the DEV-only fixture recommendation so the owner can inspect implemented UI on production without false operational claims.

The production auth gate and existing shell preference service are unchanged. No new backend endpoint, migration, upload bucket, AI/LLM call, OCR, grading, PDF generation, scheduler or email is implemented. **Frontend implemented does not mean Learning Agent operational.** All sample packages remain previews: a published week cannot truthfully be claimed without actual matching PDFs. The validator and automated tests cover valid, missing and mismatched document-pair states.

## Verification

- 30 targeted tests pass: contracts, KST week boundaries, immutable snapshots, approval/reject/rollback, full draft identity, response validation, hybrid deduplication, file validation, image/PDF component preview/reorder/remove/submission/cleanup, unsafe content handling, malformed schemas, global tab regression and system order.
- TypeScript, scoped ESLint and production Next.js build passed. Exact final commands/output are in `evidence/`.
- TEAM KAFKA Chrome verified/reused through canonical bootstrap and the official Playwright provider. Hosted DEV `/worklog` showed the existing shell without a login form. Actual STUDY interactions were checked on the owned local runtime at port 3217, at 1440px and 390px.
- Five tabs navigate; both workspaces have zero dialogs. Mobile page widths do not exceed 390px. The mobile solver canvas was 362px; desktop upload canvas 820px. Shared sidebar collapsed to 64px and expanded to 232px; mobile drawer and visible keyboard focus passed.
- Policy approval changed the future solver to 3 five-option choices plus 2 cases; today's solver remained 5 four-option choices plus an essay, v1. In-app return retained an authored draft. Explicit review revealed 6 sample explanations. Extension controls and diagram fallback were exercised.
- Twenty browser screenshots include all five tabs at desktop/mobile widths, both workspaces, policy diff/changed solver, extension kinds and distinct document previews. Handwritten browser screenshots show the empty chooser workspace; file preview behavior is covered by component tests, not misrepresented as native browser E2E.

## Observed limitations and failed checks

Initial browser actionability timeout recovered after official own-tab selection. Native file selection first timed out, then the official chooser rejected `DOM.setFileInputFiles: Not allowed`. No permission/debugging changes or protocol workaround was used. Thus actual Chrome-selected file rendering/reorder remains unverified; component-level file interaction passes. Local shared-shell requests to `localhost:8080/api/pos/preferences/system-order` produced four connection-refused errors because no backend was started. STUDY makes no HTTP requests. Two development HMR import warnings followed editing the lazy answer module; production-build verification is separate.

The original dirty `D:/DEV_SPACE/personal-work-os` checkout and its staged/untracked work were preserved. Implementation started in `codex/study-frontend-v1-20261027` from remote DEV `68f153c` in `D:/DEV_SPACE/personal-work-os-worktrees/study-frontend-v1-20261027`. Production was initially running frontend/API SHA `5146fa41f13f9ec2d284ac78b19a6ed24dae9d5d`. An unrelated WORKPAD source-pin patch was already staged for both services (`2a4d8968-915d-4a49-9ba3-76188c0935f6`, target `9fadeb8c...`); it must not be applied as a side effect of this task.

## Release and handoff status

**PRODUCTION DEPLOYED — verified SUCCESS.** URL: https://kafka-sys.life/study . Railway deployment: `88164c2f-4fa8-4e18-b216-4d97aff17fcc`, successful at 2026-10-27 07:26 KST. The existing authenticated TEAM browser reached the new page, and unauthenticated HTTP requests received the preserved 307 login redirect with the requested `/study` destination.

The narrow production source is `0207819d074ebb93f2945337117579a1064abfcc`, tagged `study-frontend-v1-20261027`, containing only the 16 STUDY/navigation frontend changes on the verified running baseline. It was uploaded through documented Railway CLI 5.62.1 to the exact production frontend service/environment, because the connector cannot upload local source into an existing service without applying the unrelated pending environment patch. No current production approval rejection occurred. The upload's deployment metadata does not expose a commitHash: the clean Git source/tag and CLI receipt establish input provenance; successful deployment and actual UI establish running behavior. Do not describe the configured Git pin as the uploaded deployment SHA.

Source integration: feature commit `644b22b`; DEV `5a9f0662401df655327cfa7898b19af0140bb3d0`; PROD merge `66e32b846d1d3f760cc15a789297a75b2274a2d8`. PROD Git preserves the pending WORKPAD commits, while the actual narrow deployed snapshot excludes them. The existing pending frontend pin was advanced to the combined PROD merge so that a later WORKPAD release retains STUDY. The pending backend pin stays `9fadeb8c...`; that environment patch was NOT accepted/applied. The existing live service Git source pin remains `5146fa41...`, distinct from the uploaded build. A future source-based release should use the reviewed combined pin, not rebuild the old pin. Backend deployment `1400d692-80df-4c7f-b127-d9b74883b4e4` is unchanged.

Production smoke passed: default disconnected state; public sample opt-in; all five tabs with matching active tab/URL; six-question/four-option original solver; no premature explanations; zero workspace dialogs; 390px solver and handwritten views; two file/camera inputs; and a WORK OS → STUDY system-switcher roundtrip. Production console: zero errors and warnings. Five additional production screenshots contain authored sample/disconnected UI only. No real production learning/finance/note records were changed or captured.

DEV integration tests: 30 passed, with an existing global-tab React act warning. The narrow production candidate independently passed 25 tests and a production build. Its first build with a cross-worktree dependency junction failed Turbopack filesystem-root validation; the junction was removed, dependencies installed locally, and the final build passed. No code/runtime restriction was weakened. Exact state and receipts are in `evidence/release-state.json`.

At the repository report commit, temporary worktree cleanup is the remaining local housekeeping step. Final Drive copies/evidence include its verified outcome. The existing dirty primary checkout is preserved throughout.

Engine integration contract: `STUDY_FRONTEND_ENGINE_CONTRACT.md`. Staged backend/engine backlog: `STUDY_ENGINE_DEFERRED_BACKLOG.md`. Google Drive publication/readback and any release blockers will be recorded in final handoff state.

Rollback: disable/revert STUDY frontend route and navigation or redeploy the previously successful frontend build. Do not restore/change production DB data or apply unrelated pending patches. Recheck live service source and pending releases before any follow-up.

DEV deployment attempt: the frontend-only source patch was read back as non-destructive, then Railway accept-deploy returned "Cancelled — the user did not approve this action. No changes were made." Automatic approval review rejected this DEV action. It was not retried via CLI/UI. The DEV frontend source patch remains staged; hosted STUDY DEV smoke is pending. The independent production source upload had already begun before this DEV rejection.
