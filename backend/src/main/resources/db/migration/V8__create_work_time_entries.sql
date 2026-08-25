-- ============================================================
-- Time & Work Management V8
-- WorkTimeEntry: a WorkRecord's ordered, additive time-log
-- children. Category is a live reference to activity_categories
-- (never snapshotted — unlike WorkRecord's applied start-time
-- criterion, a category rename must be reflected on historical
-- entries immediately, per confirmed policy). Referenced
-- categories are never hard-deleted (no delete endpoint exists),
-- so ON DELETE RESTRICT here is a safety net, not an expected
-- code path.
-- ============================================================

CREATE TABLE work_time_entries (
                                    id UUID PRIMARY KEY,
                                    user_id UUID NOT NULL,
                                    work_record_id UUID NOT NULL,
                                    category_id UUID NOT NULL,

                                    item VARCHAR(200) NOT NULL,
                                    minutes INTEGER NOT NULL,
                                    memo TEXT,

                                    position INTEGER NOT NULL,

                                    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                    CONSTRAINT fk_work_time_entries_user
                                        FOREIGN KEY (user_id)
                                            REFERENCES auth.users(id)
                                            ON DELETE CASCADE,

                                    CONSTRAINT fk_work_time_entries_work_record
                                        FOREIGN KEY (work_record_id)
                                            REFERENCES work_records(id)
                                            ON DELETE CASCADE,

                                    -- Composite FK mirrors the existing activity_categories(id, user_id)
                                    -- unique constraint (uq_activity_categories_id_user, from V1/V4) so a
                                    -- category can never belong to a different user than the entry
                                    -- referencing it, at the database level.
                                    CONSTRAINT fk_work_time_entries_category
                                        FOREIGN KEY (category_id, user_id)
                                            REFERENCES activity_categories(id, user_id)
                                            ON DELETE RESTRICT,

                                    CONSTRAINT chk_work_time_entries_minutes
                                        CHECK (minutes > 0),

                                    CONSTRAINT chk_work_time_entries_position
                                        CHECK (position >= 0),

                                    -- Deterministic ordering per record: no two entries on the same
                                    -- record may share a position.
                                    CONSTRAINT uq_work_time_entries_record_position
                                        UNIQUE (work_record_id, position)
);

CREATE INDEX idx_work_time_entries_work_record
    ON work_time_entries (work_record_id, position);
