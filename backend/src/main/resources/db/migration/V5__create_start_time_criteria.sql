-- ============================================================
-- Time & Work Management V5
-- Start Time Criteria — a user's reusable, named start-time
-- references (e.g. "오후 출근" / 15:00), selectable when a
-- future WorkRecord is created. WorkRecord must snapshot the
-- applied criterion's name and start time at that moment rather
-- than referencing this table live, so editing or deactivating a
-- row here must never retroactively change an already-saved
-- WorkRecord. The WorkRecord snapshot columns themselves are
-- deferred to a later migration.
-- ============================================================

CREATE TABLE start_time_criteria (
                                      id UUID PRIMARY KEY,
                                      user_id UUID NOT NULL,

                                      name VARCHAR(100) NOT NULL,
                                      start_time TIME NOT NULL,

                                      sort_order INTEGER NOT NULL DEFAULT 0,
                                      is_active BOOLEAN NOT NULL DEFAULT TRUE,

                                      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                      CONSTRAINT fk_start_time_criteria_user
                                          FOREIGN KEY (user_id)
                                              REFERENCES auth.users(id)
                                              ON DELETE CASCADE,

                                      CONSTRAINT chk_start_time_criteria_sort_order
                                          CHECK (sort_order >= 0)
);

-- Deterministic list ordering: sort_order first, then name, matching the
-- same (user_id, sort_order, name) pattern already used for
-- activity_categories.
CREATE INDEX idx_start_time_criteria_user_sort
    ON start_time_criteria (user_id, sort_order, name);

-- No name-uniqueness constraint: the committed frontend criteria-management
-- UI (StartTimeCriteriaModal.tsx) never validates or enforces unique names.
-- No seed rows: the two mock criteria ("오후 출근" / "저녁 출근") are
-- frontend-only illustrative data, not production seed data.
