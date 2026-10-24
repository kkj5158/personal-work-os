-- Additive: existing content, frozen snapshots and NOTE clients retain their identity.
ALTER TABLE reflection_entries ADD COLUMN IF NOT EXISTS title varchar(240);
ALTER TABLE reflection_entries ADD COLUMN IF NOT EXISTS day_score integer;
ALTER TABLE reflection_entries ADD COLUMN IF NOT EXISTS mood integer;
ALTER TABLE reflection_entries ADD CONSTRAINT reflection_day_score_range CHECK (day_score BETWEEN 0 AND 100);
ALTER TABLE reflection_entries ADD CONSTRAINT reflection_mood_range CHECK (mood BETWEEN 1 AND 5);

CREATE TABLE calendar_weekly_reviews (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    week_start date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
    title varchar(240) NOT NULL DEFAULT '',
    score integer CHECK (score BETWEEN 0 AND 100),
    mood integer CHECK (mood BETWEEN 1 AND 5),
    memo text NOT NULL DEFAULT '',
    strengths text NOT NULL DEFAULT '',
    regrets text NOT NULL DEFAULT '',
    next_week_direction text NOT NULL DEFAULT '',
    version bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, week_start)
);
