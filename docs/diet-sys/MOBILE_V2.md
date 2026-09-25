# DIET SYS — Mobile V2 / Date-first Planner / NOTE SYS projection

Product source: Drive `75_SPEC__DIET_SYS_MOBILE_V2_FINAL_20260926`. This file records
what is actually built in POS for it. Clients: POS Web DIET Planner and the
standalone `diet-sys-mobile` app (same API, same PostgreSQL data).

## Diet Daily Note (Flyway V57)

- `diet_daily_notes (owner_id, entry_date)` primary key → exactly one note per
  owner + Seoul date. `content` 1–20,000 chars, `version` for optimistic autosave.
- **No `challenge_id`.** Challenge/Focus context is derived from the date at read
  time (`challenge.startDate ≤ date ≤ endDate`). Editing Challenge periods never
  moves or re-parents a note; notes stay chronological across Challenge boundaries.
- Reading never creates a note. Saving blank content deletes the row.
- API (owner-scoped, same auth as all `/api/diet/**`):

| Call | Meaning |
|---|---|
| `GET /api/diet/notes?from&to` | notes in range (≤ 401 days), ascending |
| `GET /api/diet/notes/latest?limit=1` | most recent notes (1–50) |
| `GET /api/diet/notes/{date}` | the note, or `{content:"",version:0}` |
| `PUT /api/diet/notes/{date}` `{content, expectedVersion}` | create/update/delete; returns the note; stale version → 409 |

Clients autosave debounced and serially (one request in flight, newest text next,
failed text kept for retry, 409 → reload instead of overwrite).

## NOTE SYS auto-projection — "NOTE SYS에 다이어트 기록 자동 정리"

- Preference: `diet_settings.note_sync_enabled` (default **false** for every
  existing owner) and `note_sync_workspace_id` (FK `note_workspaces`, `ON DELETE SET NULL`).
  Stored in columns, not in the `settings` JSON, so Web settings saves cannot clobber it.
- `GET /api/diet/note-sync` → `{enabled, workspaceId, workspaceName}`;
  `PUT /api/diet/note-sync {enabled, workspaceId?}` → `{settings, projected}`.
- Target: an ordinary NOTE SYS Workspace. Resolution on enable: requested id →
  saved id → active Workspace named **다이어트 기록** → otherwise it is created (and
  added to Daily Hub once). NOTE SYS had no pre-existing "다이어트 기록" structure
  in code or DEV data; the Workspace + Daily note model is the live structure.
- Direction DIET → NOTE only. The projection is one managed atom block at the top
  of that Workspace's Daily note for the date:

```text
:::diet {"v":1,"date":"2026-09-26","measurements":{…},"checklist":{…},"note":"…","focus":[…]}
:::
```

  - one JSON line (NOTE link parser and excerpt skip it; the Tiptap `dietDay` node
    renders it read-only and keeps the payload verbatim);
  - refreshed **in place**; stray duplicates collapse to one; unchanged data does not
    bump the NOTE version (stable key order);
  - everything outside the block is the owner's NOTE content and is preserved;
  - written through `NoteSystemService.save` (workspace lock, versions, link reconciliation);
  - never parsed back: NOTE edits cannot change DIET data.
- Triggers (after the DIET transaction commits, own transaction; failures are
  logged and never fail the DIET write): day save, check/batch checks, Daily Note
  save, Challenge save/delete (old ∪ new period), checklist item edit/archive/restore
  (full re-sync). A date with no DIET content gets no block (an existing block is removed).
- OFF stops future projection and deletes nothing. ON (again) re-projects every
  date with canonical DIET content.
- Known limit: if the owner has that NOTE Daily note open in the editor while DIET
  refreshes it, the editor's next save gets NOTE SYS's normal 409 stale-version recovery.

## Future Meal Camera compatibility

Nothing implemented. Meal media can later key on `(owner_id, entry_date, captured_at)`
and reuse `journal_media` (`diet_owner_id`); the block payload is versioned (`v`) so
a `meals` section can be added without changing existing blocks.

## Migration note

V56 is MONEY (`money_bridge_credentials`, concurrent branch, applied to DEV before
V57). V57 was applied to DEV on 2026-09-26 after V56; no ignore/outOfOrder was used.
