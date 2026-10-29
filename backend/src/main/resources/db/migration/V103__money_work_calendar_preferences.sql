-- Owner display/input preferences only. No work, wage or settlement rows are changed.
CREATE TABLE money_work_calendar_preferences (
 user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 week_start VARCHAR(6) CHECK (week_start IN ('MONDAY','SUNDAY')),
 default_template_id UUID,
 version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(default_template_id,user_id) REFERENCES money_work_templates(id,user_id)
   ON DELETE SET NULL (default_template_id)
);
ALTER TABLE money_work_calendar_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY money_work_calendar_preferences_owner ON money_work_calendar_preferences
 USING(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid)
 WITH CHECK(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);
