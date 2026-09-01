-- StartTimeCriterion memo + archive (post-production iteration 2).
--
-- memo: optional free-text note (e.g. "평상시 근무 기준").
--
-- deleted_at: a one-way archive tombstone, same pattern already established
-- by checklist_items.deleted_at. Distinct from is_active (temporary,
-- reversible deactivation): a criterion referenced by any WorkRecord or
-- AttendancePlan history cannot be physically deleted (its row must remain
-- resolvable for historical display), so the user-facing "delete" action
-- archives it instead — hidden from normal management/selectors, excluded
-- from reactivation, never a normal inactive record. A criterion with no
-- usage history at all is still hard-deleted from the table (no row is
-- created here for that case).
ALTER TABLE start_time_criteria ADD COLUMN memo VARCHAR(255);
ALTER TABLE start_time_criteria ADD COLUMN deleted_at TIMESTAMPTZ;
