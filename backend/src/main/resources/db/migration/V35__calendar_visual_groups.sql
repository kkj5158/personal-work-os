-- Calendar-only context metadata. No links to Activity, State, Attendance or totals.
CREATE TABLE calendar_visual_groups (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    time_rule VARCHAR(24) NOT NULL CHECK (time_rule IN ('ALL_DAY','SAME_TIME_EACH_DAY','PER_DAY','CONTINUOUS')),
    color VARCHAR(7) NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
    start_time TIME,
    end_time TIME,
    weekday_mask INTEGER NOT NULL DEFAULT 0 CHECK (weekday_mask BETWEEN 0 AND 127),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id,user_id),
    CHECK (end_date >= start_date),
    CHECK (
        (time_rule IN ('ALL_DAY','PER_DAY') AND start_time IS NULL AND end_time IS NULL AND weekday_mask=0)
        OR (time_rule='SAME_TIME_EACH_DAY' AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time>start_time AND weekday_mask>0)
        OR (time_rule='CONTINUOUS' AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_date+end_time>start_date+start_time AND weekday_mask=0)
    ),
    CHECK (start_time IS NULL OR (EXTRACT(MINUTE FROM start_time)::INTEGER % 5=0 AND EXTRACT(SECOND FROM start_time)=0)),
    CHECK (end_time IS NULL OR (EXTRACT(MINUTE FROM end_time)::INTEGER % 5=0 AND EXTRACT(SECOND FROM end_time)=0))
);
CREATE INDEX idx_calendar_visual_groups_user_range ON calendar_visual_groups(user_id,start_date,end_date);

CREATE TABLE calendar_visual_group_days (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL,
    user_id UUID NOT NULL,
    entry_date DATE NOT NULL,
    enabled BOOLEAN NOT NULL,
    start_time TIME,
    end_time TIME,
    FOREIGN KEY (group_id,user_id) REFERENCES calendar_visual_groups(id,user_id) ON DELETE CASCADE,
    UNIQUE (group_id,entry_date),
    CHECK ((NOT enabled AND start_time IS NULL AND end_time IS NULL)
        OR (enabled AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time>start_time)),
    CHECK (start_time IS NULL OR (EXTRACT(MINUTE FROM start_time)::INTEGER % 5=0 AND EXTRACT(SECOND FROM start_time)=0)),
    CHECK (end_time IS NULL OR (EXTRACT(MINUTE FROM end_time)::INTEGER % 5=0 AND EXTRACT(SECOND FROM end_time)=0))
);
