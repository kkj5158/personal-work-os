-- Generalizes the single-value Daily Work chart target (work_chart_targets,
-- V15) into a reusable multi-line chart reference-line system (post-
-- production iteration 1, batch 2 — "기준선 설정"). Up to 3 lines per
-- (user, scope); scope separates daily-time/daily-score/weekly-time/
-- weekly-score so a daily clock-of-day-ish value is never confused with an
-- aggregated weekly duration. See docs/backend/work-chart-reference-lines.md.

CREATE TABLE work_chart_reference_lines (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    scope VARCHAR(20) NOT NULL,
    position INTEGER NOT NULL,
    label VARCHAR(20) NOT NULL,
    value INTEGER NOT NULL,
    color VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_work_chart_reference_lines_user
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,

    CONSTRAINT uq_work_chart_reference_lines_position
        UNIQUE (user_id, scope, position),

    CONSTRAINT chk_work_chart_reference_lines_scope
        CHECK (scope IN ('DAILY_TIME', 'DAILY_SCORE', 'WEEKLY_TIME', 'WEEKLY_SCORE')),

    CONSTRAINT chk_work_chart_reference_lines_color
        CHECK (color IN ('BLUE', 'GREEN', 'AMBER', 'RED', 'CYAN', 'GRAY')),

    CONSTRAINT chk_work_chart_reference_lines_position
        CHECK (position BETWEEN 0 AND 2),

    CONSTRAINT chk_work_chart_reference_lines_label_length
        CHECK (char_length(label) BETWEEN 1 AND 20),

    CONSTRAINT chk_work_chart_reference_lines_value
        CHECK (
            (scope = 'DAILY_TIME' AND value BETWEEN 1 AND 1440)
                OR (scope = 'WEEKLY_TIME' AND value BETWEEN 1 AND 10080)
                OR (scope IN ('DAILY_SCORE', 'WEEKLY_SCORE') AND value BETWEEN 0 AND 100)
            )
);

-- Migrate each existing single-goal row into two reference lines (position
-- 0 of DAILY_TIME and DAILY_SCORE respectively), labeled "목표" and given
-- the neutral GRAY color to match the old undifferentiated dashed baseline.
-- Weekly scopes are newly introduced and intentionally start empty — no
-- existing data maps to them.
INSERT INTO work_chart_reference_lines (id, user_id, scope, position, label, value, color)
SELECT gen_random_uuid(), user_id, 'DAILY_TIME', 0, '목표', target_work_minutes, 'GRAY'
FROM work_chart_targets;

INSERT INTO work_chart_reference_lines (id, user_id, scope, position, label, value, color)
SELECT gen_random_uuid(), user_id, 'DAILY_SCORE', 0, '목표', target_score, 'GRAY'
FROM work_chart_targets;

-- The old single-goal table is now fully superseded — see
-- docs/backend/work-chart-reference-lines.md for the migration rationale.
DROP TABLE work_chart_targets;
