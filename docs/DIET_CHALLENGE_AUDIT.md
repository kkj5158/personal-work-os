# Challenge implementation audit — 2026-10-25

Audited before changes against origin/dev `0a400b9`.

- `/diet/planner` owns challenge management; `Planner.tsx`, `useChallengeDrafts.ts` and `lib/diet/challengeDrafts.ts` already provide per-ID drafts, owner-scoped local persistence, global save/cancel, validation, remote comparison, partial-success cleanup and lost-response reconciliation.
- Canonical supported types are WEIGHT/CHECKLIST/MANUAL, roles CURRENT_FOCUS/NEXT_FOCUS/FINAL_GOAL, statuses WAITING/ACTIVE/COMPLETED/STOPPED. `keyPoint` is the existing description/objective; there is no separate description property. Preserve this field rather than inventing an unsaved description.
- `challengeProgress` is canonical for weight/checklist/manual progress. Unknown values are null; future-start presentation must not mutate status.
- Historically `store.save("challenges", value)` PUTs the owner-scoped unversioned API; `store.remove("challenges", id)` DELETEs it then reloads. `DietService.delete` applies owner checking and the existing owner advisory lock. V36 relations cascade challenge-item memberships, challenge milestones and legacy challenge-owned `diet_goals`; the independent global goals introduced in V37 stay intact. Shared diet days, checklist items/results, journal notes and mobile diary records are not dependent on challenge deletion.
- Milestones use existing canonical save/remove; newly created challenges must be saved before milestones can be persisted. Keep all existing milestone and bullet memo fields, color, missing-record policies, manual progress and checklist selection.
- Scope plan: extract one reusable editor/detail with metrics and milestones; render it both in Planner and an embed modal; retain canonical hook and store. Add confirmed challenge deletion with exact persisted title and dependency count. Move challenge management before ancillary calendar/timeline sections without deleting those capabilities.
- No schema change, data migration, automatic reclassification or PROD mutation is required by this subtask.

Compatibility decision: the existing mobile `/api/diet/mobile/plans` view wraps the same canonical Challenge in a SHA-256 version. The shared draft hook now saves/deletes through its existing CAS endpoints (expectedVersion `new` for creation), preventing the preflight/PUT race without a second record or schema. Both Planner and the Daily Note modal share this path. Reordering and milestone mutations retain their existing domain operations. Successful mutations publish `diet-challenges-changed`; same-window owner-scoped drafts share updates; cross-window conflicting drafts preserve local input and block unsafe close.

## Scoped validation

- `npx tsx --test app/diet/ChallengeDetail.test.tsx lib/diet/challengeDrafts.test.ts`: 12 PASS. Covers future presentation without status mutation; type-specific forms/advanced options; new-item delete absence; persisted draft input; cross-window draft preservation; canonical CAS save; conflict retention; confirmed delete failure/retry; existing validation, partial save and response-loss reconciliation.
- `npx next typegen` then `npx tsc --noEmit`: PASS. Initial typecheck before generation had only missing generated `LayoutProps`; generating current Next route types resolved it.
- Scoped ESLint: PASS after ref-access fixes.
- Browser/API round-trip and integrated screenshots belong to the parent integration task and are not claimed by these component tests. No deployment, migration or real user-data mutation occurred in this worktree.
