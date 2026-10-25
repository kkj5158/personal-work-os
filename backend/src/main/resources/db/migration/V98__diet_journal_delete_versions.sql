-- Keep a versioned empty tombstone after an explicit diary clear, preventing
-- stale offline version-zero drafts from resurrecting a deleted daily record.
-- No existing diary content is changed and no rows are removed.
ALTER TABLE diet_daily_notes DROP CONSTRAINT diet_daily_notes_content_check;
ALTER TABLE diet_daily_notes ADD CONSTRAINT diet_daily_notes_content_check CHECK(length(content) BETWEEN 0 AND 20000);
