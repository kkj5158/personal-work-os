# Verification commands

The implementation candidate is 51ffe5b98060416e78e990c66463a1bf652bc6f1. Final backend-only validation used this committed application/test code (documentation/evidence edits were pending and dirty=true is retained). The final numeric guards reject conversion overflow before persistence. Final frontend targeted tests, lint and standalone production build/TypeScript passed at 3fe6796; its frontend tree is unchanged in the candidate. Real-provider/browser evidence is b927a0b. Later deltas are generic real-workspace copy, hiding the legacy demo-only material chooser, and invalid-number rejection. These boundaries are explicit; no exact-final hosted run is claimed.

From repository root:

```powershell
node qa/study-owned-tests.mjs
node qa/study-dev-runtime.mjs
```

The managed runtime loads existing approved DEV storage configuration in memory, creates an owned loopback PostgreSQL cluster, runs full Flyway/JPA startup, performs real provider/API checks, builds/starts the production frontend and waits for `stop` in its owned terminal. No shared business DB is connected. `stop` performs exact-key provider cleanup and shuts down retained owned process handles. The runner's runtime/result JSON and logs are retained locally, with sanitized copies in this evidence package.

From frontend:

```powershell
.\node_modules\.bin\tsx.cmd --test --test-concurrency=1 lib/study/study.test.ts lib/study/serverPort.test.ts app/study/Workspaces.test.tsx lib/globalTabs.test.ts lib/systemOrder.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\eslint.cmd app/study lib/study
npm run build
```

The final production build is additionally run by `study-dev-runtime.mjs` with its owned API URL. Official browser calls used the dedicated TEAM KAFKA provider at desktop 1440x1000 and mobile 390x844. Screenshots and observed assertions are in this evidence directory. The local production frontend's runtime env is `dev`; JWT rejection tests use the real hosted security chain separately.

Broad frontend discovery was:

```powershell
$taskFiles=@(rg --files app components lib -g '*.test.ts' -g '*.test.tsx')
.\node_modules\.bin\tsx.cmd --test --test-concurrency=1 @taskFiles
```

Result: 708/693 passed/15 failed. Six failures are standalone scripts incompatible with that generic tsx/CJS runner. Each passes with its documented command:

```powershell
node --experimental-transform-types app/worklog/activityCategory.test.ts
node --experimental-transform-types app/worklog/attendanceAggregation.test.ts
node --experimental-transform-types app/worklog/attendanceCalendarLogic.test.ts
node --experimental-transform-types app/worklog/checklistLogic.test.ts
node --experimental-transform-types app/worklog/latenessSummary.test.ts
node --experimental-transform-types lib/notes/notes.test.ts
```

The remaining nine assertion failures reproduced in an exported, unmodified origin/dev frontend with the same dependency installation (29 tests, 20 passed, 9 failed): calendarContext, calendarEditor, DailyFeed, NoteEditor, NoteEditorSource, TaskDetailPanel, TodayWiki, TopicNoteNavigation. No affected source or dependency file in those areas was changed by STUDY. See baseline and full-suite logs for each assertion; this is not a whole-repository PASS.

Backend broad attempt:

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
.\gradlew.bat test --no-daemon --max-workers=2 --console=plain
```

Result: 1502 tests, 942 passed, 4 failed, 556 skipped without external datasource configuration. A safe rerun of the four failing classes used only the already running **owned loopback** database at 127.0.0.1:55450, its synthetic runtime owner and trust-auth test role:

```powershell
.\gradlew.bat test --tests 'com.kafka.backend.BackendApplicationTests' --tests 'com.kafka.backend.sleep.GoogleSleepPostgresTest' --tests 'com.kafka.backend.sleep.SleepAutoSyncPostgresTest' --tests 'com.kafka.backend.sleep.SleepNapPostgresTest' --no-daemon --max-workers=2 --console=plain
```

That rerun passed all 90 Sleep PostgreSQL tests. BackendApplicationTests still encounters the unchanged DietMeasurementQaApplication test fixture's qaUser/devCurrentUserProvider ambiguity. The actual main-only bootJar starts and validates successfully. No unrelated fixture code was changed to manufacture a green broad result.

The optional StudyProviderCleanupTest is intentionally skipped in ordinary tests; the owned provider runtime explicitly enables it only for its synthetic owner and exact keys. Provider cleanup logs record deletion acknowledgments without credentials, signed URLs or object keys. Local PostgreSQL data directories are excluded from the evidence archive.
