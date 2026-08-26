-- Timestamp of the most recent 결근 정정 ("absence correction") applied to
-- this record, or NULL if it has never been corrected. Paired with
-- absence_auto_generated (V10) to distinguish "automatically absent,
-- uncorrected" from "corrected" for statistics and UI display. Persists
-- across later ordinary edits to the same record (never cleared by a
-- plain PUT) — only a fresh correction call updates it again.
ALTER TABLE work_records
    ADD COLUMN absence_corrected_at TIMESTAMPTZ;
