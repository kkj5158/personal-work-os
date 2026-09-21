-- Preserve historical PASS/FAIL/UNSET; UNRECORDED means the recording routine failed.
ALTER TABLE checklist_daily_entries DROP CONSTRAINT chk_checklist_daily_entries_result;
ALTER TABLE checklist_daily_entries ADD CONSTRAINT chk_checklist_daily_entries_result
    CHECK (result IN ('UNSET', 'PASS', 'FAIL', 'UNRECORDED'));
