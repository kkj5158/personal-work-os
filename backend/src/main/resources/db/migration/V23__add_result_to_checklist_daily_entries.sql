-- Checklist explicit PASS/FAIL/UNSET result (replaces the plain achieved
-- boolean's binary semantics). UNSET is distinct from FAIL: "no result
-- recorded yet" vs. an explicit "did not follow this item" action.
--
-- Historical compatibility: every existing achieved=true row becomes PASS;
-- every existing achieved=false row (which previously meant "not achieved
-- yet" or "not achieved", never a recorded explicit failure) becomes UNSET,
-- never a fabricated historical FAIL.
--
-- The legacy `achieved` column is kept (not dropped) as a mirror written
-- alongside `result` (`achieved = result == 'PASS'`) — see
-- ChecklistDailyEntry.setResult — so existing reads of `achieved` (e.g.
-- ChecklistAnalyticsService) keep working unchanged; this migration only
-- adds, it never removes.
ALTER TABLE checklist_daily_entries
    ADD COLUMN result VARCHAR(10) NOT NULL DEFAULT 'UNSET';

UPDATE checklist_daily_entries
    SET result = 'PASS'
    WHERE achieved = true;

ALTER TABLE checklist_daily_entries
    ALTER COLUMN result DROP DEFAULT;

ALTER TABLE checklist_daily_entries
    ADD CONSTRAINT chk_checklist_daily_entries_result
        CHECK (result IN ('UNSET', 'PASS', 'FAIL'));
