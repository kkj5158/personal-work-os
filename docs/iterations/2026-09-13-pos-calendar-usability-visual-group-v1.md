# POS Calendar Usability + Visual Group V1

## Final verdict

PROD DEPLOYED — READY FOR REAL-WORLD USER FEEDBACK

## Git

- Baseline dev: `1ac6e74835daafcd3f8fa0c8acb185ed8200947a` (integrated Orbit Post-V1).
- Feature implementation SHA: `7a297a866cded1ce9a37dda8dad058a0878fb70d` on `feat/pos/calendar-usability-visual-group-v1`.
- Final dev: `97b9632446d75898e799d51cae1012902555e696`.
- Final prod: `98381ea6f96dce6665878b72c417c0fe06ae4aa0`.
- Feature implementation, dev and prod file trees are identical. This report is a later documentation-only feature-branch update.
- Inspected dev-to-prod history and diff: only this iteration's seven implementation commits plus integration merge. No unrelated changes.

## Implemented

- Actual first-valid creation and serialized/debounced autosave; healthy selection, mode and shell navigation flush without warnings. Incomplete time pairs and invalid source drafts stay local; failures retain input with retry and meaningful-loss guards. State retains its established explicit save behavior.
- Unscheduled Actual ↔ date grid direct pointer dragging, exact duration and original WORK/LIFE source identity. Cross-date horizontal moves preserve five-minute offsets; meaningful vertical moves use relative fifteen-minute steps. Rejected overlaps identify the existing record's time and WORK/LIFE domain and roll back.
- Shared fixed root/child category controls for Planning and Actual. Roots are valid values, children optional, parent changes reset the child, domain changes clear categories, and active domain sources remain separate.
- Personal OS visible identity, page titles and PWA metadata. Crow icon assets and `orbit.globalTabs.v1` compatibility key preserved.
- Independent CalendarVisualGroup CRUD with ALL_DAY, SAME_TIME_EACH_DAY weekday selection, normalized PER_DAY overrides, and cross-midnight CONTINUOUS endpoints. No Activity membership, overlap validation or statistics participation.
- Explicit group creation mode, dedicated autosave editor, palette, immediate deletion/Undo, common TimeGrid pointer engine for group move/resize, and visible-range slices across weeks/month boundaries. Group decoration never enters Activity lane packing.
- Mode-specific persisted visibility: Planning/Execution on by default, Compare off by default.

## Database and API

- Additive `V35__calendar_visual_groups.sql`; no existing migration modified.
- New `calendar_visual_groups` and `calendar_visual_group_days` tables, owner foreign keys, date/rule/time/color constraints and cascade cleanup.
- Separate `/api/calendar/visual-groups` endpoints; no Calendar Activity projection, Reflection snapshot or totals contract changed.
- DEV normal Flyway startup: validated 35 migrations, observed schema 34, applied V35 at 20:37:09 KST on 2026-09-13. Hibernate validation/JPA initialization and DEV readiness succeeded at 20:37:17.
- Actual GET/PUT source APIs reused; no Calendar-owned duplicate Actual storage introduced.
- PROD normal Flyway startup on 2026-09-13 KST: validated 35 migrations at 21:04:34, observed schema 34 at 21:04:35, and applied V35 successfully at 21:04:36.778. JPA initialized at 21:04:39.868; application ready at 21:04:43.466 with `active_profile=prod db_environment=PROD`.

## Targeted QA actually run

- Backend: 39 targeted tests passed across Visual Group controller/service/persistence and Actual editor/overlap services. Isolated H2 Hibernate checks cover timestamps, replacing PER_DAY overrides, rule switches, owner isolation, deletion cascade and safe Undo. Follow-up targeted persistence assertions passed.
- Frontend: 23 editor/category/nearby Post-V1 checks, 7 group model/layer/editor/hook checks, 9 branding checks, 4 actual/group pointer/visibility checks and 2 direct-write serialization/source preservation checks passed (45 unique checks across these runs).
- TypeScript passed; optimized Next.js production build passed (14 static pages generated). Focused ESLint passed for changed implementation surfaces.
- DEV API integration: PER_DAY create/update/delete/Undo restored the same ID and replaced child rows correctly; temporary API fixture removed.
- DEV browser: login screen branding; WORK existing data, NOTE SYS, LIFE CODE and Global Tabs navigation; category parent/child/reset/domain behavior; Actual autosave and invalid timing draft; real pointer cross-date move; grid→unscheduled→grid with the same ID and exact 35-minute duration; group drag creation/autosave, move and resize leaving Actual untouched; PER_DAY OFF, CONTINUOUS and ALL_DAY controls; 2 multi-week groups rendered as 14 visible-week slices with unchanged Activity CSS geometry; visibility reload persistence/Compare defaults/Planning display; deletion and Undo. No browser warning/error logs observed.
- Native time-input `fill` in the browser adapter did not consistently dispatch application edits, so keyboard interaction was used for save checks and a precisely identified API fixture supplied 09:05–09:40 for pointer precision checks. No claim is made that synthetic `fill` verified native time editing.
- Found and fixed during integration: Planning Domain changes must not acquire an Actual source type; invalid timing must not replace persisted grid geometry; late direct-write responses must not overwrite another editor; discarding a draft must not resave its projected title during a drag. Direct writes now wait before navigation and read the persisted source after flush/discard.
- Intentionally skipped the old full 447-test backend suite and unrelated historical frontend suites: no new evidence justified repeating them.
- An optional additional optimized localhost server launch (`npm run start -- --port 3001`) was rejected by automatic approval review without a stated reason. It was not retried by another route. The production build passed; browser QA had already passed on the same implementation using the DEV server.

## Integration and deployment

- Feature pushed; clean no-conflict merge into latest dev; exact tree equality checked.
- Short post-integration DEV smoke: WORK records, NOTE workspaces, LIFE categories, WORK categories, Calendar and Visual Group endpoints all returned 200 on the already-running V35 DEV backend. Extended frontend browser QA above ran on the identical feature tree before integration.
- PROD pushed through the established `prod` branch Railway auto-deploy path, with the exact validated dev tree. No manual PROD schema mutation.
- Backend deployment: `f9723906-f354-46a1-91e2-af69fe14988c`; Railway Details confirmed **Deployment successful** and exact commit `98381ea6f96dce6665878b72c417c0fe06ae4aa0`.
- Frontend deployment: `5c62f3d5-a46c-4085-8eb6-a974ef382e5d`; Railway Details confirmed **Deployment successful** and the same exact commit.
- PROD frontend: https://personal-work-os-frontend-prod-production.up.railway.app
- PROD backend: https://personal-work-os-prod-production.up.railway.app
- PROD smoke passed: backend health 200/UP, manifest name/short name Personal OS, anonymous Calendar redirect to login, authenticated return to the requested Calendar date, category controls, existing WORK records, NOTE SYS workspace, LIFE CODE categories, and Global Tabs navigation. Browser warning/error log was empty.
- Minimal PROD UI write smoke passed: one LIFE Actual created automatically, memo autosaved, and one overlapping Visual Group created automatically. Reload retained both and the Actual memo. Both temporary records were immediately deleted through the UI; fresh Calendar loads confirmed zero Actuals, groups and unscheduled records in the fixture date. The temporary Calendar Global Tab was closed, returning to the existing Calendar tab.

## Remaining non-blocking limits

- WORK Actual still needs a valid category and an existing destination Work Log; regular work also needs a workday. Calendar does not fabricate attendance or weaken source-domain requirements.
- Dense overlapping group titles truncate in narrow Week columns; full titles remain available through the header tooltip/editor. Group lanes are independent decorations, with no unlimited nesting system.
- Group Undo uses the established short-lived server token grammar (30 seconds, single backend process); a server restart can expire pending Undo.
- Browser reload/window-close still guards in-flight or meaningful unsaved input; healthy in-app navigation flushes.

## Data safety

- No real user records were changed for QA. DEV fixtures were isolated to 2020-01-06 onward and removed by exact IDs/title checks. Final DEV Calendar collections were empty for the fixture range; group range response was `[]`.
- Removed DEV fixtures: Actual `31b3f40f-3c12-440a-9ef4-9b077f26fa32`; groups `9843b377-a767-46e5-9c2d-c1b1ec86d79f`, `01501bcd-49da-4507-95c2-2462b07061ce`, plus the short-lived API CRUD fixture removed in its `finally` cleanup.
- Removed PROD fixtures on 2020-01-06: Actual `83c1b063-3e35-4279-adc0-434d8dcff755` (`POS PROD QA 20260913`) and Visual Group `48554f01-1023-4461-9d26-cc39d9927102` (`POS PROD Group QA 20260913`). No attendance or WORK fixture was created, and no real user record was edited.
- Main working copy and unrelated dirty assets were preserved; all implementation used dedicated worktrees.
- `.claude/settings.local.json` baseline and verified final SHA-256 are identical: `F668CF8281D70C5EB19E9E89BA108B8B4B0D433C70EFE84E4DD148DCA949F73B`.

## Local cleanup

- This iteration's DEV frontend and backend were stopped. Port 18091 has no listener; the subsequent port 3001 listener belongs to the separate `note-daily-hub` worktree and was left untouched.
- The three temporary Chrome deployment/PROD QA tabs were closed. The in-app localhost tab had become a browser-generated connection-error `data:` page after shutdown; Browser Use URL policy rejected its viewport reset/close operations. No bypass was attempted. Its final viewport-reset state is unconfirmed.
- The implementation/report worktree is retained as a reviewable local report location; unrelated worktrees and files remain untouched.
- Removed this iteration's three agent worktrees (`pos/calendar-editor`, `pos/visual-group-backend`, `pos/visual-group-ui`) and temporary release worktree (`release-pos-calendar-vg`) using Git-aware removal after verifying clean status and integrated patch equivalence. Their local branches retain the original agent commit references.
