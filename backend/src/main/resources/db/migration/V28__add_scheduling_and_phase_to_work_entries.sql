-- ============================================================
-- Workflow Calendar V1
-- WorkTimeEntry has never carried a start/end time (only minutes),
-- which made it permanently "Unscheduled Actual" from the
-- Calendar's point of view. Calendar's "assign start/end to the
-- EXISTING actual record" workflow (Unscheduled Actual -> Time
-- Grid) requires WorkTimeEntry to support the same optional,
-- both-or-neither start/end pair SupplementalWorkEntry already has
-- (V22) — minutes/total_minutes remains the duration source of
-- truth in both entities; start_at/end_at are display/scheduling
-- only and are never used to recompute it.
--
-- Both work_time_entries and supplemental_work_entries also gain
-- an optional phase_id, per the locked Phase-bridge policy (V26):
-- Project is always derived via phases.project_id, never
-- duplicated onto these rows.
-- ============================================================

ALTER TABLE work_time_entries
    ADD COLUMN start_at TIMESTAMPTZ,
    ADD COLUMN end_at TIMESTAMPTZ;

ALTER TABLE work_time_entries
    ADD CONSTRAINT chk_work_time_entries_start_end_pair
        CHECK ((start_at IS NULL) = (end_at IS NULL));

ALTER TABLE work_time_entries
    ADD CONSTRAINT chk_work_time_entries_start_before_end
        CHECK (start_at IS NULL OR end_at > start_at);

ALTER TABLE work_time_entries
    ADD COLUMN phase_id UUID;

ALTER TABLE work_time_entries
    ADD CONSTRAINT fk_work_time_entries_phase
        FOREIGN KEY (phase_id, user_id)
            REFERENCES phases(id, user_id)
            ON DELETE SET NULL;

CREATE INDEX idx_work_time_entries_phase
    ON work_time_entries (phase_id);

ALTER TABLE supplemental_work_entries
    ADD COLUMN phase_id UUID;

ALTER TABLE supplemental_work_entries
    ADD CONSTRAINT fk_supplemental_work_entries_phase
        FOREIGN KEY (phase_id, user_id)
            REFERENCES phases(id, user_id)
            ON DELETE SET NULL;

CREATE INDEX idx_supplemental_work_entries_phase
    ON supplemental_work_entries (phase_id);
