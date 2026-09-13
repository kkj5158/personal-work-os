-- Independent DIET SYS domain. Numeric measurements deliberately use typed columns.
CREATE TABLE diet_settings (
 owner_id UUID PRIMARY KEY REFERENCES auth.users(id), settings JSONB NOT NULL DEFAULT '{}'
);
CREATE TABLE diet_days (
 owner_id UUID NOT NULL REFERENCES auth.users(id), entry_date DATE NOT NULL,
 morning_weight DOUBLE PRECISION, target_weight DOUBLE PRECISION,
 morning_glucose DOUBLE PRECISION, morning_breath_ketone DOUBLE PRECISION,
 bedtime_glucose DOUBLE PRECISION, bedtime_breath_ketone DOUBLE PRECISION,
 morning_blood_ketone DOUBLE PRECISION, bedtime_blood_ketone DOUBLE PRECISION,
 waist_circumference DOUBLE PRECISION, fasting_hours DOUBLE PRECISION,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,entry_date)
);
CREATE TABLE diet_items (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id),
 title VARCHAR(200) NOT NULL CHECK(length(trim(title))>0),
 importance VARCHAR(12) NOT NULL CHECK(importance IN ('CORE','SECONDARY','OPTIONAL')),
 key_point VARCHAR(2000) NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
 weekly_reference INTEGER CHECK(weekly_reference BETWEEN 0 AND 7),
 monthly_reference INTEGER CHECK(monthly_reference BETWEEN 0 AND 31),
 active BOOLEAN NOT NULL DEFAULT true, start_date DATE NOT NULL,
 UNIQUE(owner_id,id)
);
CREATE TABLE diet_checks (
 owner_id UUID NOT NULL, entry_date DATE NOT NULL, item_id UUID NOT NULL,
 state VARCHAR(8) NOT NULL CHECK(state IN ('SUCCESS','FAILURE','MISSING')), memo VARCHAR(4000) NOT NULL DEFAULT '',
 PRIMARY KEY(owner_id,entry_date,item_id),
 FOREIGN KEY(owner_id,item_id) REFERENCES diet_items(owner_id,id)
);
CREATE TABLE diet_challenges (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id), title VARCHAR(200) NOT NULL CHECK(length(trim(title))>0),
 type VARCHAR(12) NOT NULL CHECK(type IN ('WEIGHT','CHECKLIST','MANUAL')),
 status VARCHAR(12) NOT NULL CHECK(status IN ('WAITING','ACTIVE','COMPLETED','STOPPED')),
 start_date DATE NOT NULL, end_date DATE NOT NULL CHECK(end_date>=start_date), color VARCHAR(7) NOT NULL,
 key_point VARCHAR(2000) NOT NULL DEFAULT '', notes JSONB NOT NULL DEFAULT '[]', sort_order INTEGER NOT NULL DEFAULT 0,
 start_weight DOUBLE PRECISION, target_weight DOUBLE PRECISION,
 goal_mode VARCHAR(8) NOT NULL CHECK(goal_mode IN ('RATE','COUNT')), include_missing BOOLEAN NOT NULL DEFAULT true,
 current_value DOUBLE PRECISION, target_value DOUBLE PRECISION, UNIQUE(owner_id,id)
);
-- IDs are an explicit snapshot: changing item importance cannot change membership.
CREATE TABLE diet_challenge_items (
 owner_id UUID NOT NULL, challenge_id UUID NOT NULL, item_id UUID NOT NULL, position INTEGER NOT NULL,
 PRIMARY KEY(owner_id,challenge_id,item_id),
 FOREIGN KEY(owner_id,challenge_id) REFERENCES diet_challenges(owner_id,id) ON DELETE CASCADE,
 FOREIGN KEY(owner_id,item_id) REFERENCES diet_items(owner_id,id)
);
CREATE TABLE diet_goals (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id), challenge_id UUID,
 kind VARCHAR(12) NOT NULL CHECK(kind IN ('SHORT_TERM','WEEKLY','MONTHLY','FINAL')),
 entry_date DATE NOT NULL, value DOUBLE PRECISION NOT NULL CHECK(value>0), UNIQUE(owner_id,id),
 FOREIGN KEY(owner_id,challenge_id) REFERENCES diet_challenges(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE diet_milestones (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id), challenge_id UUID NOT NULL,
 entry_date DATE NOT NULL, value DOUBLE PRECISION NOT NULL CHECK(value>0),
 title VARCHAR(200) NOT NULL DEFAULT '', memo VARCHAR(4000) NOT NULL DEFAULT '',
 FOREIGN KEY(owner_id,challenge_id) REFERENCES diet_challenges(owner_id,id) ON DELETE CASCADE
);
CREATE INDEX diet_items_order ON diet_items(owner_id,sort_order,id);
CREATE INDEX diet_challenges_order ON diet_challenges(owner_id,sort_order,id);
CREATE INDEX diet_goals_date ON diet_goals(owner_id,entry_date);
CREATE INDEX diet_milestones_date ON diet_milestones(owner_id,entry_date);
-- API owns all access. No public PostgREST policies are granted.
ALTER TABLE diet_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_challenge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_milestones ENABLE ROW LEVEL SECURITY;
