# Sleep Web V2 + LIFE OS Integrated Calendar — paused checkpoint

Status: PAUSED at the owner's explicit request on 2026-10-14 (Asia/Seoul), because of usage limits. Do not resume implementation, QA, or deployment until the owner requests resumption.

Resumed on 2026-10-15 at the owner's request. The pause statements below describe the historical checkpoint; current progress is in RESUME_REPORT_20261015_KO.md and evidence/resume-20261015/acceptance.json.

## Confirmed checkpoint

- Worktree: `D:/DEV_SPACE/personal-work-os-worktrees/sleep-web-v2-life-calendar`.
- Branch: `codex/sleep-web-v2-life-calendar`.
- HEAD: `468ae8009a44788fef1059406bab91f142767ea4`.
- Working tree was clean immediately before writing this checkpoint. This checkpoint is an intentionally uncommitted documentation file; no commit or push was performed during pause cleanup.
- Resume handoff was read: `C:/Users/JIUU/Downloads/SLEEP_WEB_V2_QA_RELEASE_RESUME_20261014_EN (1).md`.
- Latest canonical browser policy was read, but the combined output was truncated. Read its remaining tail and `BOOTSTRAP_USAGE.txt` separately before browser work.
- Official `team_kafka_playwright` MCP tool capabilities were discovered. No browser connection, authenticated test, deployment change, or new implementation fix was performed in this resumed run before pause.
- Pause cleanup found no running process named `node`, `java`, or `adb`. There is no known active task-owned runtime or tool session to terminate. Owner browsers and unrelated work were not touched.
- No active goal object exists. No recurring automation was created.

## Existing implementation and evidence — historical, not fresh deployment verification

- Implementation commit: `709b066`; integration commit: `e8c8a67`; final application candidate: `b123c5945ee70bb2dc10d12a5ccb8e98e2444a1b`; historical closeout documentation: `468ae80`.
- Existing implementation includes Sleep weekly/day/month views, statistics/settings compatibility, separate `/life/calendar`, canonical Sleep/Nap/Exercise writes, persisted read-only Calendar SYS, cross-midnight projection without splitting records, workout cards with approximately 96px minimum height, preview/save/cancel and source conflict handling.
- No new database migration or table was introduced. Android source was not modified.
- Existing recorded evidence: frontend 35/35; backend 96/96; Exercise PostgreSQL 2/2; post-integration 29/29; typecheck, scoped lint, production build and backend bootJar passed. These are prior-run results, not new acceptance results.
- One historical GlobalTabs test failed on an apparently stale `LIFE CODE` label expectation. Verify current canonical product wording before changing the test.
- Historical hosted probes were anonymous security/availability checks. Authenticated browser acceptance and physical Android synchronization were not verified in the prior closeout.
- Existing evidence is under `docs/sleep-web-v2-life-calendar/evidence/`; primary visual/reference files are under `reference/`. Preserve those files and original source data.

## Resume in this order

1. Read current repository policies (`AGENTS.md`, `agent/README.md`, operating, Git, validation and production policies). Inspect both main and this worktree status; preserve unrelated dirty work in `D:/DEV_SPACE/personal-work-os`.
2. Complete reading `C:/Users/JIUU/.codex/browser/TEAM_KAFKA_BROWSER_POLICY.md` and `BOOTSTRAP_USAGE.txt`. Run `Ensure-TeamKafkaBrowser.ps1` before connection verification and perform the documented fresh Phase 2 preflight. Use the existing TEAM KAFKA profile only; never personal Chrome or new debugging interfaces.
3. Verify fresh remote dev/prod commits, Railway service deployments, URLs and auth/database topology. The attached handoff reports later deployments may already include Sleep V2 in PROD; this has NOT been freshly verified by this resumed run. Do not assume the previous closeout's blocked promotion still describes current PROD.
4. Compare deployed commits and key blobs: `SleepWorkspace.tsx`, `TimeCalendar.tsx`, `lib/life-calendar/model.ts`, `SleepController.java`, and `/life/calendar/page.tsx`. Avoid duplicate/no-op deployments.
5. Prefer the approved official `team_kafka_playwright` MCP path. Its first `browser_navigate` to the authorized DEV URL can establish the owned tab without a tab mention; verify actual transport/profile/auth readiness. The official provider's narrowly authorized management of its own tabs is distinct from prohibited manipulation of owner tab groups. Missing tracing/group APIs alone is not a blocker under the updated policy.
6. Before fixture writes, verify actual DEV owner/auth/data source after Railway migration. Inspect old audit scripts before reuse; they may assume obsolete Supabase configuration. Never extract or print cookies, bearer tokens, extension credentials, or private auth storage.
7. Perform authenticated DEV acceptance using disposable canonical fixtures and original domain APIs. Cover menu/default week, modes/statistics/recommendations, nap CRUD, 30/45/60/75 minute workout readability, actual persisted/read-only SYS/filtering, 1600/1366/1024/390 layouts, light/dark, keyboard focus, actual drag/start/end resize, preview/save/cancel/conflict, cross-midnight timestamps/seconds/offsets, original IDs/revisions and reload. Cleanup only owned fixtures via original APIs.
8. Fix proven defects only, rerun appropriate regression/browser checks, safely integrate latest dev if needed, and deploy only required verified changes through existing authorized release gates. If code is already deployed and acceptance passes, finalize without another deployment.
9. Perform authenticated read-only PROD smoke. Physical Flip6 sync is conditional on an authorized connected device; otherwise report NOT VERIFIED. Do not clear/reinstall devices or replay risky production outboxes.
10. Produce the requested Korean completion report with actual implemented routes, source/API ownership, commits/files, database changes, automated/browser evidence, DEV/PROD state and remaining defects/blockers/design deviations. Distinguish historical evidence from same-run verified results.

## Railway identifiers for read-only discovery

- Project: `2b52b232-38b2-44b6-b97e-4caba54f90bc` (Personal Work OS).
- DEV environment: `9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c`; web service `b7f1a522-21a4-488e-b4e1-fbd4c60ce4ae`; API service `eba7d263-7dc3-448a-a6b8-c2994721b597`.
- PROD environment: `c2c20488-311f-4b9e-9ec9-d79508123176`; web service `5818a578-b7a2-443a-aaad-ce10f6bb708c`; API service `e46b58f4-e829-430f-a4c4-b27e24d46f19`.
- Handoff snapshots mention DEV `dd42e8e` and PROD `c2679e2`; these are leads for verification, not newly confirmed live state.

Resume authorization is still pending. Wait for the owner's next instruction.
