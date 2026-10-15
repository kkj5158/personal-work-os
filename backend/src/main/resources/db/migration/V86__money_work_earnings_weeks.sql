-- Confirmed daily earnings plus two weekly add-ons; V84/V85 history is untouched.
CREATE TABLE money_work_earnings_weeks (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 week_start DATE NOT NULL CHECK(extract(dow FROM week_start)=0),
 data JSONB NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 last_request VARCHAR(64) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,week_start)
);
ALTER TABLE money_work_earnings_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY money_work_earnings_weeks_owner ON money_work_earnings_weeks
 USING(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid)
 WITH CHECK(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);
