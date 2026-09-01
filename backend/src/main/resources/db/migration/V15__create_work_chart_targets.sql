-- Daily Work chart targets (post-production iteration 1). Simple CURRENT
-- values only, deliberately no effective-dated history — see REQ-04 in the
-- iteration brief. At most one row per user.

CREATE TABLE work_chart_targets (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    target_work_minutes INTEGER NOT NULL,
    target_score INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_work_chart_targets_user
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,

    CONSTRAINT uq_work_chart_targets_user
        UNIQUE (user_id),

    CONSTRAINT chk_work_chart_targets_work_minutes
        CHECK (target_work_minutes > 0 AND target_work_minutes <= 1440),

    CONSTRAINT chk_work_chart_targets_score
        CHECK (target_score BETWEEN 0 AND 100)
);
