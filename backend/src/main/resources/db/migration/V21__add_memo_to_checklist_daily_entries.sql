-- Checklist UI/UX restructure: per-date x per-item bullet memo (Day view).
-- Ownership is (work_record, item) — the exact same row checklist_daily_entries
-- already scopes to that pair — never a global Item description. Plain
-- nullable free-text column, no versioning/history, matching the established
-- work_records.memo pattern (see WorkRecord.java) rather than a new entity.
-- Bullet lines are persisted as newline-joined text; the frontend renders/
-- edits them as a bullet list.
ALTER TABLE checklist_daily_entries
    ADD COLUMN memo TEXT;
