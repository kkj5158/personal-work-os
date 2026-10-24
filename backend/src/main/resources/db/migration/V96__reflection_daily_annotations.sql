-- Add date annotations to the existing WORK_OS owner/date row. NOTE content,
-- completion state, frozen snapshot and historical records remain intact.
ALTER TABLE reflection_entries
    ADD COLUMN title VARCHAR(100),
    ADD COLUMN day_score INTEGER,
    ADD COLUMN mood_level INTEGER,
    ADD COLUMN memo VARCHAR(10000),
    ADD CONSTRAINT chk_reflection_daily_title CHECK (title !~ E'[\\n\\r]'),
    ADD CONSTRAINT chk_reflection_daily_score CHECK (day_score BETWEEN 0 AND 100),
    ADD CONSTRAINT chk_reflection_daily_mood CHECK (mood_level BETWEEN 1 AND 5);
