# POS V2 Navigation — Final QA Results

Date: 2026-11-15. Release status: DEV and PROD deployed, exact-SHA health checks and authenticated smoke completed. See the implementation report for deployment IDs, commits and rollback.

## Automated verification

Navigation: **41 passed, 0 failed** (`npm run test:navigation`). Covers Space/system ownership, exact WORK groups, independent checklist separation, route fallback/recent context, archived=1, guards, legacy pin/duplicate tabs, StrictMode, menu keyboard/focus/outside behavior, new-tab handling, POS home and mobile shell behavior. PROD-based navigation + LOG suite: **56 passed, 0 failed**.

DEV and isolated PROD production builds pass; modified-file ESLint and TypeScript pass. Full frontend enumeration through the repository TSX runner: **733 passed / 748 total, 15 failed**. Every failing file was rerun against unchanged baseline `c6e4053c` and the same 15 failures reproduced. Existing failures concern standalone SystemSwitcher/STUDY/WORKFLOW expectation drift, Calendar test environment, NOTE CSS/fixture and runner assumptions. Supported standalone NOTE runner and five Worklog transform-types scripts pass. Whole-project lint compared with unchanged updated baseline `320d0d67`: identical diagnostic keys, **34 errors / 42 warnings** on each side. These are known baseline defects, not a claimed fully green broad suite. Final focused regressions cover subsequent StrictMode/root/archive fixes.

## Actual deployed DEV browser acceptance

Real application components and normal authenticated session, no mock content or replacement backend. Nine routes `/workflow/week`, `/notes`, `/blog`, `/study`, `/authoring`, `/life/categories`, `/diet`, `/checklist`, `/money` each return 200 and correct Space/system options. FINANCE has no redundant dropdown; WORK has no independent-system dropdown; focused systems keep original sidebars with recoverable global tabs. Clean sweep: 60 API responses, no failed responses, no uncaught JS errors, no write requests. Masked screenshots `pos-v2-dev-real-0.png` through `8.png` correspond in that order.

All 13 WORK links were exercised through the real sidebar and stayed in WORK. Calendar retained the contextual Calendar rail, mini-month and both category domains beside the new WORK menu. Fifteen LIFE deep links and fourteen MONEY deep links returned 200 with correct ownership; AUTHORING/Library and legacy `/workflow` redirect also passed. Existing `/checklist/manage/items` redirect to `/checklist` and `/checklist/archived` redirect to `/checklist?archived=1` are preserved. Returning to LIFE now restores the latter query exactly; this was found and fixed during QA.

Space return restored NOTE `module=DAILY_HUB&date=2026-11-14` and MONEY `/money/flow`. Reload preserved exact global-tab IDs; browser back returned to MONEY and forward returned to the same NOTE date. Existing-workspace controls were present. No business records were edited for route coverage.

390px WORK drawer opened and closed after fixing header/overlay stacking. Only the WORK checklist appears there. At 320px the shared header fits. Mobile NOTE system menu contains NOTE/LOG only; Escape closes it and restores focus. POS home exposes exactly five Spaces. Independent LIFE dropdown contains exactly LIFE OS/DIET/CHECKLIST.

## Actual unsaved-change guards and cleanup

- Calendar: created only a local unsaved blank-grid draft; title input dirtied it. Space switch was held with the existing `.cal-unsaved-guard`; Continue retained it; Discard continued to MONEY. No save/delete was issued.
- MONEY: opened the original new-account form, typed a temporary name, and selected LIFE. Native confirmation appeared and dismissal held `/money/accounts`; cancel closed the new form. No account registration was submitted.
- NOTE: inserted one temporary editor transaction. Blocked flush prevented Space navigation. A physical shortcut dispatch did not undo in this provider; standard DOM Ctrl+Z through the original editor successfully restored it. No QA marker remained in `notes.draft.*` storage, followed by controlled reload.
- DIET Note: existing embedded NOTE editor was found; insertion and Space switch attempted a save, two write requests were blocked and route remained `/diet/note`. Original editor Undo restored the transaction, draft marker count was zero, followed by controlled navigation/reload.

Non-read API requests were intercepted and aborted during these probes. **No business write was forwarded.** Expected blocked-save console errors belong to guard tests, not the clean read-only sweep. No fixture/profile/account/checklist record was created. Existing local content was restored; temporary unsaved forms were cancelled/discarded through native controls.

## PROD acceptance

Exact tested frontend tree released through normal PROD PR #25 and explicit API/Web pins at `1d7fb87ecc9385ea9f7b02cbab4305f0a4548921`. API SUCCESS, health UP, expected PROD identity, 100 migrations validated, V108 unchanged. Web SUCCESS at the same SHA. Authenticated nine-system read-only sweep: 42 API responses, no failures or uncaught page errors. WORK/Calendar and both checklist destinations, mobile navigation/dropdowns and root entry were verified after deployment. Sanitized `prod-smoke.json` contains concrete results; privacy-cropped header images `pos-v2-prod-*.png` provide visual evidence.

The separate Calendar probe logged the existing missing daily reflection GET as 404. The unchanged `dailyReflectionTransport.load` explicitly maps 404 to an empty reflection; no reflection was created. Initial QA selectors used `.cal-rail` rather than the native `.calendar-rail`, and an Escape event targeted the trigger rather than the focused menu. Corrected probes verified one native rail/mini-month/WORK menu and successful menu Escape/focus return; `prod-probe-corrections.json` records those corrections. Mobile actionability waits also timed out; supported DOM actions and the drawer close hit-test passed. These are distinguished from the clean nine-system sweep.

## Browser provenance and limitations

Existing TEAM KAFKA Chrome Default root was verified before connection with the reusable bootstrap. Official extension ID `mmlmfjhmonkocbjadbfplnigmagldckm`, extension 0.5.0 and MCP 0.0.83; full profile arguments and protected-input presence checked without printing input contents. Current client tab navigation/DOM authenticated the actual connection; process readiness alone was not counted. No Computer Use/native UI, personal profile, browser restart, unrelated tabs/groups or new debug endpoint were used.

Legacy Codex Phase 2 identity cannot attest the Playwright transport; hidden transport IDs/tracing are not exposed and were not invented. Supported navigation, DOM, standard keyboard/pointer interaction, viewport and screenshots were used. Intermittent Calendar screenshot/actionability timeouts and keyboard dispatch gaps are preserved as environment limits. Original populated LOG rail geometry could not be measured on the DEV account's empty profile. No unsupported performance/tracing assertion is made.

Evidence includes `scope-audit.json`, route/guard result JSON, navigation/test summaries, release/profile/staged-diff observations, masked real-page screenshots and bootstrap observations. Files exclude credentials, unrelated private content and sensitive raw logs. Existing reports and evidence are updated in place in the work Drive account and connector-read back before delivery.
