# DIET journal bridge audit — 2026-10-25

Base: origin/dev 0a400b9; implementation isolated in diet-journal-bridge-20261025.

- Mobile DIET NOTE uses `GET/PUT /api/diet/notes/{date}` and `diet_daily_notes(owner_id, entry_date)` with a 20,000-character string, expectedVersion CAS, local/offline draft queues. Its editor is a plain TextInput; photos are ordered canonical Camera records from `/api/diet/camera/media`, with timestamps and captions.
- Web NOTE SYS uses `journal_notes` Markdown with versions, a workspace row lock, explicit owned-media validation, aliases/tags and the shared Tiptap NoteEditor. Its `:::diet` snapshot currently includes mobile text in a read-only atom, while the ordinary body remains separate.
- `DietNoteSync` is owner-opt-in. OFF must remain OFF; camera projections, deletion and restore follow that setting. Projection holds diet_settings, diet-camera advisory lock, then workspace lock; preserve this ordering for web writes.
- `DietCameraProjection` copies validated image bytes into workspace-owned journal_media and binds identity in diet_camera_note_media; original and derived image refs cannot be treated as interchangeable.

## Additive compatibility plan

Keep existing tables/APIs and editor. Place mobile text directly in the existing rich-text body following the embed. On web save of the enabled target daily journal, atomically CAS the same dated canonical string and normal NOTE version. Add canonical version to the snapshot. Projection-only writes bypass reverse synchronization to prevent loops. Check the canonical snapshot base before web writes even if an earlier projection failed. Preserve legacy manual body and media when first projecting text; do not silently overwrite unrelated content. Retain canonical Camera media projection and ordering.

No data migration/backfill runs automatically; no schema change. The existing opt-in target is the only bridged workspace. Non-target workspaces and operational notes retain ordinary behavior.

## Limits to report truthfully

Native mobile currently edits a string and renders Camera photos separately. Shared Markdown is lossless as stored text but the existing mobile TextInput does not visually render rich formatting or arbitrary NOTE-uploaded image rows. Do not claim a full native rich-media edit round trip or physical-device acceptance from backend tests. Camera originals/captions remain canonical and preserved, and this bridge must not authorize deletion of Camera media from a journal edit.

## Delete/recreate CAS correction (V98, additive schema compatibility)

Inspection found that the existing physical blank-delete resets version to zero. An offline version-zero draft could therefore resurrect a date after creation and deletion (ABA). V98 relaxes only the content minimum length; existing rows are untouched. Explicit clear now retains an empty canonical tombstone with a monotonic version. Tombstones are omitted from range/latest/journal history. Old clients already accept nonnegative versions, so the existing queued expectedVersion protocol remains valid. No new table or destructive migration.
