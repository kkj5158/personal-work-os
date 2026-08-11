-- ============================================================
-- Time & Work Management V1
-- PostgreSQL / Supabase
-- ============================================================


-- ============================================================
-- 1. WORK SETTINGS
-- User-specific yearly work/leave settings
-- ============================================================

CREATE TABLE work_settings (
                               id UUID PRIMARY KEY,
                               user_id UUID NOT NULL,

                               setting_year INTEGER NOT NULL,

                               annual_leave_allowance INTEGER NOT NULL DEFAULT 0,
                               sick_leave_allowance INTEGER NOT NULL DEFAULT 0,
                               early_leave_allowance INTEGER NOT NULL DEFAULT 0,

                               created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                               updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                               CONSTRAINT fk_work_settings_user
                                   FOREIGN KEY (user_id)
                                       REFERENCES auth.users(id)
                                       ON DELETE CASCADE,

                               CONSTRAINT uq_work_settings_user_year
                                   UNIQUE (user_id, setting_year),

                               CONSTRAINT chk_work_settings_annual_leave
                                   CHECK (annual_leave_allowance >= 0),

                               CONSTRAINT chk_work_settings_sick_leave
                                   CHECK (sick_leave_allowance >= 0),

                               CONSTRAINT chk_work_settings_early_leave
                                   CHECK (early_leave_allowance >= 0)
);


-- ============================================================
-- 2. WORK SCHEDULE
-- Date-specific planned work schedule
-- ============================================================

CREATE TABLE work_schedules (
                                id UUID PRIMARY KEY,
                                user_id UUID NOT NULL,

                                work_date DATE NOT NULL,

                                planned_status VARCHAR(30) NOT NULL DEFAULT 'WORK',

                                planned_start_time TIME,

                                grace_minutes INTEGER,

                                target_duration_minutes INTEGER,

                                memo TEXT,

                                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                CONSTRAINT fk_work_schedules_user
                                    FOREIGN KEY (user_id)
                                        REFERENCES auth.users(id)
                                        ON DELETE CASCADE,

                                CONSTRAINT uq_work_schedules_user_date
                                    UNIQUE (user_id, work_date),

                                CONSTRAINT chk_work_schedules_status
                                    CHECK (
                                        planned_status IN (
                                                           'WORK',
                                                           'DAY_OFF',
                                                           'ANNUAL_LEAVE',
                                                           'SICK_LEAVE'
                                            )
                                        ),

                                CONSTRAINT chk_work_schedules_grace
                                    CHECK (
                                        grace_minutes IS NULL
                                            OR grace_minutes BETWEEN 0 AND 1440
                                        ),

                                CONSTRAINT chk_work_schedules_target_duration
                                    CHECK (
                                        target_duration_minutes IS NULL
                                            OR target_duration_minutes BETWEEN 0 AND 1440
                                        )
);


-- ============================================================
-- 3. WORK RECORD
-- Actual work/attendance record
-- ============================================================

CREATE TABLE work_records (
                              id UUID PRIMARY KEY,
                              user_id UUID NOT NULL,

                              work_date DATE NOT NULL,

                              status VARCHAR(30) NOT NULL DEFAULT 'PRESENT',

                              clock_in_at TIMESTAMPTZ,
                              clock_out_at TIMESTAMPTZ,

                              manual_duration_minutes INTEGER,

                              work_location VARCHAR(100),

                              work_score INTEGER,

                              memo TEXT,

                              created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                              updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                              CONSTRAINT fk_work_records_user
                                  FOREIGN KEY (user_id)
                                      REFERENCES auth.users(id)
                                      ON DELETE CASCADE,

                              CONSTRAINT uq_work_records_user_date
                                  UNIQUE (user_id, work_date),

                              CONSTRAINT chk_work_records_status
                                  CHECK (
                                      status IN (
                                                 'PRESENT',
                                                 'DAY_OFF',
                                                 'ANNUAL_LEAVE',
                                                 'EARLY_LEAVE',
                                                 'ABSENT',
                                                 'SICK_LEAVE'
                                          )
                                      ),

                              CONSTRAINT chk_work_records_clock_order
                                  CHECK (
                                      clock_in_at IS NULL
                                          OR clock_out_at IS NULL
                                          OR clock_out_at >= clock_in_at
                                      ),

                              CONSTRAINT chk_work_records_manual_duration
                                  CHECK (
                                      manual_duration_minutes IS NULL
                                          OR manual_duration_minutes BETWEEN 0 AND 1440
                                      ),

                              CONSTRAINT chk_work_records_score
                                  CHECK (
                                      work_score IS NULL
                                          OR work_score BETWEEN 0 AND 100
                                      )
);


-- ============================================================
-- 4. CALENDAR CATEGORY
-- Two-level calendar block category hierarchy
-- ============================================================

CREATE TABLE calendar_categories (
                                     id UUID PRIMARY KEY,
                                     user_id UUID NOT NULL,

                                     name VARCHAR(100) NOT NULL,

                                     parent_id UUID,

                                     sort_order INTEGER NOT NULL DEFAULT 0,

                                     is_active BOOLEAN NOT NULL DEFAULT TRUE,

                                     created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                     updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                     CONSTRAINT fk_calendar_categories_user
                                         FOREIGN KEY (user_id)
                                             REFERENCES auth.users(id)
                                             ON DELETE CASCADE,

    -- Required so composite FKs can guarantee
    -- that parent/child categories belong to the same user.
                                     CONSTRAINT uq_calendar_categories_id_user
                                         UNIQUE (id, user_id),

                                     CONSTRAINT fk_calendar_categories_parent
                                         FOREIGN KEY (parent_id, user_id)
                                             REFERENCES calendar_categories(id, user_id)
                                             ON DELETE RESTRICT,

                                     CONSTRAINT chk_calendar_categories_not_self_parent
                                         CHECK (
                                             parent_id IS NULL
                                                 OR parent_id <> id
                                             ),

                                     CONSTRAINT chk_calendar_categories_sort_order
                                         CHECK (sort_order >= 0)
);


-- Top-level category names must be unique per user.
CREATE UNIQUE INDEX uq_calendar_categories_root_name
    ON calendar_categories (user_id, LOWER(name))
    WHERE parent_id IS NULL;


-- Child category names must be unique
-- under the same parent for the same user.
CREATE UNIQUE INDEX uq_calendar_categories_child_name
    ON calendar_categories (user_id, parent_id, LOWER(name))
    WHERE parent_id IS NOT NULL;


-- ============================================================
-- 5. CALENDAR BLOCK
-- General-purpose daily schedule block
-- ============================================================

CREATE TABLE calendar_blocks (
                                 id UUID PRIMARY KEY,
                                 user_id UUID NOT NULL,

                                 category_id UUID,

                                 title VARCHAR(200) NOT NULL,

                                 start_at TIMESTAMPTZ NOT NULL,
                                 end_at TIMESTAMPTZ NOT NULL,

                                 memo TEXT,

                                 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

                                 CONSTRAINT fk_calendar_blocks_user
                                     FOREIGN KEY (user_id)
                                         REFERENCES auth.users(id)
                                         ON DELETE CASCADE,

                                 CONSTRAINT fk_calendar_blocks_category
                                     FOREIGN KEY (category_id, user_id)
                                         REFERENCES calendar_categories(id, user_id)
                                         ON DELETE RESTRICT,

                                 CONSTRAINT chk_calendar_blocks_time_order
                                     CHECK (end_at > start_at)
);


-- ============================================================
-- 6. INDEXES
-- Initial indexes for common V1 queries
-- ============================================================

CREATE INDEX idx_work_schedules_user_date
    ON work_schedules (user_id, work_date);

CREATE INDEX idx_work_records_user_date
    ON work_records (user_id, work_date);

CREATE INDEX idx_calendar_blocks_user_start
    ON calendar_blocks (user_id, start_at);

CREATE INDEX idx_calendar_blocks_user_time_range
    ON calendar_blocks (user_id, start_at, end_at);

CREATE INDEX idx_calendar_blocks_category
    ON calendar_blocks (category_id);

CREATE INDEX idx_calendar_categories_user_parent
    ON calendar_categories (user_id, parent_id);