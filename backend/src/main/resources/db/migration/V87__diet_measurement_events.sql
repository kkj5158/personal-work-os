-- Additive facts for Mobile V2; V86 is reserved by MONEY earnings weeks.
-- diet_days remains the compatible legacy read model.
-- No historical value, precision, unknown time, slot, or non-measurement column is dropped.
CREATE TABLE diet_measurements (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL REFERENCES auth.users(id),
 metric VARCHAR(16) NOT NULL CHECK(metric IN ('weight','glucose','bloodKetone','breathKetone')),
 entry_date DATE NOT NULL, measured_at TIMESTAMPTZ, value DOUBLE PRECISION NOT NULL,
 unit VARCHAR(12) NOT NULL, slot VARCHAR(16) NOT NULL CHECK(slot IN ('MORNING','BEFORE_SLEEP')),
 revision BIGINT NOT NULL DEFAULT 1, source VARCHAR(32) NOT NULL DEFAULT 'POS_LEGACY',
 metadata JSONB NOT NULL DEFAULT '{}', legacy_field VARCHAR(32), deleted_at TIMESTAMPTZ,
 CHECK(value >= 0 AND value <= 1000000 AND (metric <> 'weight' OR value > 0)),
 CHECK(metric <> 'weight' OR slot = 'MORNING'), CHECK(revision > 0)
);
CREATE UNIQUE INDEX diet_measurements_daily_weight ON diet_measurements(owner_id,entry_date) WHERE metric='weight' AND deleted_at IS NULL;
CREATE UNIQUE INDEX diet_measurements_legacy_cell ON diet_measurements(owner_id,entry_date,legacy_field) WHERE legacy_field IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX diet_measurements_history ON diet_measurements(owner_id,entry_date DESC,id DESC) WHERE deleted_at IS NULL;
CREATE TABLE diet_measurement_operations (
 owner_id UUID NOT NULL REFERENCES auth.users(id), operation_id UUID NOT NULL,
 request JSONB NOT NULL, response JSONB NOT NULL, PRIMARY KEY(owner_id,operation_id)
);
ALTER TABLE diet_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_measurement_operations ENABLE ROW LEVEL SECURITY;

-- Legacy writes share the existing DietService owner lock with event mutations.
-- A mobile transaction suppresses only its own legacy projection's trigger.
CREATE FUNCTION diet_capture_legacy_measurements() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f TEXT; k TEXT; s TEXT; u TEXT; v DOUBLE PRECISION; t TIMESTAMPTZ; old_json JSONB;
BEGIN
 IF current_setting('app.diet_projection',true) = '1' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN old_json := to_jsonb(OLD); ELSE old_json := '{}'::jsonb; END IF;
 FOREACH f IN ARRAY ARRAY['morning_weight','morning_glucose','bedtime_glucose','morning_blood_ketone','bedtime_blood_ketone','morning_breath_ketone','bedtime_breath_ketone'] LOOP
  k := CASE WHEN f='morning_weight' THEN 'weight' WHEN f LIKE '%glucose' THEN 'glucose' WHEN f LIKE '%blood_ketone' THEN 'bloodKetone' ELSE 'breathKetone' END;
  s := CASE WHEN f LIKE 'morning_%' THEN 'MORNING' ELSE 'BEFORE_SLEEP' END;
  u := CASE k WHEN 'weight' THEN 'kg' WHEN 'glucose' THEN 'mg/dL' WHEN 'bloodKetone' THEN 'mmol/L' ELSE 'ppm' END;
  v := (to_jsonb(NEW)->>f)::double precision;
  t := CASE s WHEN 'MORNING' THEN NEW.morning_measured_at ELSE NEW.bedtime_measured_at END;
  IF TG_OP='INSERT' OR (to_jsonb(NEW)->f IS DISTINCT FROM old_json->f) OR
     (to_jsonb(NEW)->(CASE s WHEN 'MORNING' THEN 'morning_measured_at' ELSE 'bedtime_measured_at' END) IS DISTINCT FROM old_json->(CASE s WHEN 'MORNING' THEN 'morning_measured_at' ELSE 'bedtime_measured_at' END)) THEN
   IF v IS NULL THEN
    -- An explicit legacy clear clears that cell's active facts, retaining audit rows.
    UPDATE diet_measurements SET deleted_at=now(),revision=revision+1,legacy_field=NULL
      WHERE owner_id=NEW.owner_id AND entry_date=NEW.entry_date AND metric=k AND slot=s AND deleted_at IS NULL;
   ELSE
    UPDATE diet_measurements SET value=v,measured_at=t,revision=revision+1
      WHERE owner_id=NEW.owner_id AND entry_date=NEW.entry_date AND legacy_field=f AND deleted_at IS NULL;
    IF NOT FOUND THEN
     INSERT INTO diet_measurements(owner_id,metric,entry_date,measured_at,value,unit,slot,legacy_field,metadata)
       VALUES(NEW.owner_id,k,NEW.entry_date,t,v,u,s,f,jsonb_build_object('legacyDate',NEW.entry_date,'legacyField',f));
    END IF;
   END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER diet_days_capture_measurements AFTER INSERT OR UPDATE ON diet_days FOR EACH ROW EXECUTE FUNCTION diet_capture_legacy_measurements();
-- Fire capture on unchanged rows only for this initial backfill; values are never rounded.
INSERT INTO diet_measurements(owner_id,metric,entry_date,measured_at,value,unit,slot,legacy_field,metadata)
SELECT d.owner_id,v.metric,d.entry_date,v.measured_at,v.value,v.unit,v.slot,v.field,
 jsonb_build_object('legacyDate',d.entry_date,'legacyField',v.field)
FROM diet_days d CROSS JOIN LATERAL (VALUES
 ('weight',d.morning_weight,'kg','MORNING',d.morning_measured_at,'morning_weight'),
 ('glucose',d.morning_glucose,'mg/dL','MORNING',d.morning_measured_at,'morning_glucose'),
 ('glucose',d.bedtime_glucose,'mg/dL','BEFORE_SLEEP',d.bedtime_measured_at,'bedtime_glucose'),
 ('bloodKetone',d.morning_blood_ketone,'mmol/L','MORNING',d.morning_measured_at,'morning_blood_ketone'),
 ('bloodKetone',d.bedtime_blood_ketone,'mmol/L','BEFORE_SLEEP',d.bedtime_measured_at,'bedtime_blood_ketone'),
 ('breathKetone',d.morning_breath_ketone,'ppm','MORNING',d.morning_measured_at,'morning_breath_ketone'),
 ('breathKetone',d.bedtime_breath_ketone,'ppm','BEFORE_SLEEP',d.bedtime_measured_at,'bedtime_breath_ketone')
) v(metric,value,unit,slot,measured_at,field) WHERE v.value IS NOT NULL;
