-- Date-free weekly templates. Existing Planning/Actual/NOTE records are untouched.
CREATE TABLE calendar_timetables (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    memo TEXT NOT NULL DEFAULT '',
    checklist TEXT NOT NULL DEFAULT '[]',
    default_color VARCHAR(7),
    philosophy TEXT NOT NULL DEFAULT '',
    philosophy_version BIGINT NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (default_color IS NULL OR default_color ~ '^#[0-9a-fA-F]{6}$')
);
CREATE INDEX calendar_timetables_owner_order ON calendar_timetables(owner_id, sort_order, created_at, id);
CREATE TABLE calendar_timetable_blocks (
    id UUID PRIMARY KEY,
    timetable_id UUID NOT NULL REFERENCES calendar_timetables(id),
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
    title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
    memo TEXT NOT NULL DEFAULT '',
    color VARCHAR(7),
    version BIGINT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$')
);
CREATE INDEX calendar_timetable_blocks_parent ON calendar_timetable_blocks(timetable_id, weekday, start_minute);
