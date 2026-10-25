-- Expand only: monetary JSON, versions, receipt/payment history and timestamps are untouched.
CREATE TABLE IF NOT EXISTS money_workplaces (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id),
 data JSONB NOT NULL, version BIGINT NOT NULL DEFAULT 1,
 last_request VARCHAR(64) NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,user_id)
);
ALTER TABLE money_work_templates ADD COLUMN IF NOT EXISTS workplace_id UUID;
ALTER TABLE money_coupang_work_records ADD COLUMN IF NOT EXISTS workplace_id UUID;
ALTER TABLE money_work_earnings_weeks ADD COLUMN IF NOT EXISTS workplace_id UUID;

-- Deterministic per-owner identity; retry cannot create a second default workplace.
INSERT INTO money_workplaces(id,user_id,data)
SELECT md5('money-workplace:coupang:'||u.user_id)::uuid,u.user_id,
 jsonb_build_object('name','쿠팡','active',true,'presets',COALESCE((
  SELECT jsonb_agg(preset ORDER BY preset->>'id') FROM (
   SELECT DISTINCT ON (p->>'id') p AS preset
   FROM money_work_templates t CROSS JOIN LATERAL jsonb_array_elements(t.data->'presets') p
   WHERE t.user_id=u.user_id ORDER BY p->>'id',t.updated_at DESC,t.id
  ) presets),'[]'::jsonb))
FROM (SELECT user_id FROM money_work_templates UNION SELECT user_id FROM money_coupang_work_records
 UNION SELECT user_id FROM money_work_earnings_weeks) u
ON CONFLICT(id) DO NOTHING;

-- Refuse ambiguous legacy preset IDs instead of changing their financial meaning.
DO $$ BEGIN
 IF EXISTS (SELECT t.user_id,p->>'id' FROM money_work_templates t
  CROSS JOIN LATERAL jsonb_array_elements(t.data->'presets') p
  GROUP BY t.user_id,p->>'id' HAVING count(DISTINCT p)>1)
 THEN RAISE EXCEPTION 'Conflicting legacy preset identity; explicit mapping required'; END IF;
END $$;
UPDATE money_work_templates SET workplace_id=md5('money-workplace:coupang:'||user_id)::uuid WHERE workplace_id IS NULL;
UPDATE money_coupang_work_records SET workplace_id=md5('money-workplace:coupang:'||user_id)::uuid WHERE workplace_id IS NULL;
UPDATE money_work_earnings_weeks SET workplace_id=md5('money-workplace:coupang:'||user_id)::uuid WHERE workplace_id IS NULL;
ALTER TABLE money_work_templates ALTER COLUMN workplace_id SET NOT NULL;
ALTER TABLE money_coupang_work_records ALTER COLUMN workplace_id SET NOT NULL;
ALTER TABLE money_work_earnings_weeks ALTER COLUMN workplace_id SET NOT NULL;

-- Older API instances can still insert during the backend-first rolling transition.
CREATE OR REPLACE FUNCTION money_calendar_default_workplace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.workplace_id IS NULL THEN
  NEW.workplace_id=md5('money-workplace:coupang:'||NEW.user_id)::uuid;
  INSERT INTO money_workplaces(id,user_id,data) VALUES(NEW.workplace_id,NEW.user_id,
   jsonb_build_object('name','쿠팡','active',true,'presets','[]'::jsonb)) ON CONFLICT(id) DO NOTHING;
 END IF;
 IF TG_TABLE_NAME='money_work_templates' AND NEW.data->>'workplaceId' IS NULL
  AND (TG_OP='INSERT' OR NEW.data->'presets' IS DISTINCT FROM OLD.data->'presets') THEN
  -- Bridge an old instance's template-local edit during rolling deployment.
  UPDATE money_workplaces w SET data=jsonb_set(w.data,'{presets}',COALESCE((
   SELECT jsonb_agg(preset ORDER BY preset->>'id') FROM (
    SELECT DISTINCT ON (preset->>'id') preset FROM (
     SELECT p AS preset,0 AS priority FROM jsonb_array_elements(COALESCE(NEW.data->'presets','[]'::jsonb)) p
     UNION ALL SELECT p,1 FROM jsonb_array_elements(COALESCE(w.data->'presets','[]'::jsonb)) p
    ) candidates ORDER BY preset->>'id',priority
   ) merged),'[]'::jsonb)),version=version+1,last_request='',updated_at=now()
   WHERE w.id=NEW.workplace_id AND w.user_id=NEW.user_id;
  UPDATE money_work_templates SET version=version+1,last_request=''
   WHERE user_id=NEW.user_id AND workplace_id=NEW.workplace_id AND id<>NEW.id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS money_calendar_workplace_default ON money_work_templates;
CREATE TRIGGER money_calendar_workplace_default BEFORE INSERT OR UPDATE ON money_work_templates FOR EACH ROW EXECUTE FUNCTION money_calendar_default_workplace();
DROP TRIGGER IF EXISTS money_calendar_workplace_default ON money_coupang_work_records;
CREATE TRIGGER money_calendar_workplace_default BEFORE INSERT ON money_coupang_work_records FOR EACH ROW EXECUTE FUNCTION money_calendar_default_workplace();
DROP TRIGGER IF EXISTS money_calendar_workplace_default ON money_work_earnings_weeks;
CREATE TRIGGER money_calendar_workplace_default BEFORE INSERT ON money_work_earnings_weeks FOR EACH ROW EXECUTE FUNCTION money_calendar_default_workplace();

-- Exact legacy constraints, no table or record removal.
ALTER TABLE money_coupang_work_records DROP CONSTRAINT IF EXISTS money_coupang_work_records_user_id_work_date_key;
ALTER TABLE money_work_earnings_weeks DROP CONSTRAINT IF EXISTS money_work_earnings_weeks_user_id_week_start_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_money_earnings_workplace_week ON money_work_earnings_weeks(user_id,week_start,workplace_id);
CREATE INDEX IF NOT EXISTS idx_money_work_date ON money_coupang_work_records(user_id,work_date,id);
CREATE INDEX IF NOT EXISTS idx_money_workplace_date ON money_coupang_work_records(user_id,workplace_id,work_date);
CREATE INDEX IF NOT EXISTS idx_money_template_workplace ON money_work_templates(user_id,workplace_id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='money_template_workplace_fk' AND conrelid='money_work_templates'::regclass) THEN
  ALTER TABLE money_work_templates ADD CONSTRAINT money_template_workplace_fk FOREIGN KEY(workplace_id,user_id) REFERENCES money_workplaces(id,user_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='money_record_workplace_fk' AND conrelid='money_coupang_work_records'::regclass) THEN
  ALTER TABLE money_coupang_work_records ADD CONSTRAINT money_record_workplace_fk FOREIGN KEY(workplace_id,user_id) REFERENCES money_workplaces(id,user_id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='money_week_workplace_fk' AND conrelid='money_work_earnings_weeks'::regclass) THEN
  ALTER TABLE money_work_earnings_weeks ADD CONSTRAINT money_week_workplace_fk FOREIGN KEY(workplace_id,user_id) REFERENCES money_workplaces(id,user_id);
 END IF;
END $$;
ALTER TABLE money_workplaces ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polname='money_workplaces_owner' AND polrelid='money_workplaces'::regclass) THEN
 CREATE POLICY money_workplaces_owner ON money_workplaces
 USING(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid)
 WITH CHECK(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);
 END IF;
END $$;
