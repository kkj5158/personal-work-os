-- ============================================================
-- Time & Work Management V22
-- SupplementalWorkEntry (보강근무): additional actual-work time
-- recorded separately from ordinary WorkTimeEntry ("정규근무"),
-- explicitly created by the user, allowed under every Attendance
-- status, and never deleted as a side effect of an Attendance
-- transition (unlike WorkTimeEntry, whose presence blocks a
-- working -> non-working transition — that guard deliberately
-- does not apply here, see WorkRecordService).
--
-- Modeled directly on work_time_entries (V8): client-assigned id,
-- denormalized user_id, live (never snapshotted) category
-- reference, deterministic position ordering. Two differences:
--   - total_minutes is the aggregation source of truth (never
--     recomputed from start/end by the backend), analogous to
--     WorkTimeEntry.minutes but named distinctly so the two
--     concepts are never confused in code or in this schema.
--   - start_at/end_at are optional, same-day, and must be
--     supplied as a pair (both null or both present) — enforced
--     by chk_supplemental_work_entries_start_end_pair. No overnight
--     handling is introduced in this version (see
--     chk_supplemental_work_entries_start_before_end).
-- Overlap validation (supplemental-vs-supplemental and
-- supplemental-vs-regular-attendance-interval) is an application-
-- level concern (SupplementalWorkEntryService), matching this
-- codebase's existing PlannedTimeBlockService overlap pattern —
-- no DB exclusion constraint is introduced here.
-- ============================================================

CREATE TABLE supplemental_work_entries (
                                            id UUID PRIMARY KEY,
                                            user_id UUID NOT NULL,
                                            work_record_id UUID NOT NULL,
                                            category_id UUID NOT NULL,

                                            item VARCHAR(200) NOT NULL,
                                            total_minutes INTEGER NOT NULL,
                                            start_at TIMESTAMPTZ,
                                            end_at TIMESTAMPTZ,
                                            memo TEXT,

                                            position INTEGER NOT NULL,

                                            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                            CONSTRAINT fk_supplemental_work_entries_user
                                                FOREIGN KEY (user_id)
                                                    REFERENCES auth.users(id)
                                                    ON DELETE CASCADE,

                                            CONSTRAINT fk_supplemental_work_entries_work_record
                                                FOREIGN KEY (work_record_id)
                                                    REFERENCES work_records(id)
                                                    ON DELETE CASCADE,

                                            -- Composite FK mirrors work_time_entries' own pattern (V8) against
                                            -- the existing activity_categories(id, user_id) unique constraint,
                                            -- so a category can never belong to a different user than the
                                            -- supplemental entry referencing it.
                                            CONSTRAINT fk_supplemental_work_entries_category
                                                FOREIGN KEY (category_id, user_id)
                                                    REFERENCES activity_categories(id, user_id)
                                                    ON DELETE RESTRICT,

                                            CONSTRAINT chk_supplemental_work_entries_total_minutes
                                                CHECK (total_minutes > 0),

                                            CONSTRAINT chk_supplemental_work_entries_position
                                                CHECK (position >= 0),

                                            -- Start/end must be supplied together — never a half-interval.
                                            CONSTRAINT chk_supplemental_work_entries_start_end_pair
                                                CHECK ((start_at IS NULL) = (end_at IS NULL)),

                                            -- Same-day interval only in this version — no overnight rule
                                            -- (unlike WorkRecord's clock-in/clock-out).
                                            CONSTRAINT chk_supplemental_work_entries_start_before_end
                                                CHECK (start_at IS NULL OR end_at > start_at),

                                            -- Deterministic ordering per record: no two entries on the same
                                            -- record may share a position.
                                            CONSTRAINT uq_supplemental_work_entries_record_position
                                                UNIQUE (work_record_id, position)
);

CREATE INDEX idx_supplemental_work_entries_work_record
    ON supplemental_work_entries (work_record_id, position);
