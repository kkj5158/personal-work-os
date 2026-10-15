-- Independent work-management data. No financial transaction or WORK OS data is written.
CREATE TABLE money_work_templates (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 data JSONB NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 last_request VARCHAR(64) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,user_id)
);
CREATE TABLE money_coupang_work_records (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 work_date DATE NOT NULL, data JSONB NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 last_request VARCHAR(64) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(id,user_id), UNIQUE(user_id,work_date)
);
CREATE TABLE money_work_payments (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 work_record_id UUID NOT NULL, deposit_date DATE NOT NULL,
 amount BIGINT NOT NULL CHECK(amount>0 AND amount<=999999999999),
 FOREIGN KEY(work_record_id,user_id) REFERENCES money_coupang_work_records(id,user_id),
 UNIQUE(id,user_id)
);
CREATE INDEX idx_money_work_payments_deposit ON money_work_payments(user_id,deposit_date,id);
CREATE TABLE money_work_weeks (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 week_start DATE NOT NULL CHECK(extract(isodow FROM week_start)=1),
 data JSONB NOT NULL, version BIGINT NOT NULL DEFAULT 0,
 last_request VARCHAR(64) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,week_start)
);
ALTER TABLE money_work_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_coupang_work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_work_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_work_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY money_work_templates_owner ON money_work_templates USING(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid) WITH CHECK(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);
CREATE POLICY money_coupang_work_records_owner ON money_coupang_work_records USING(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid) WITH CHECK(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);
CREATE POLICY money_work_payments_owner ON money_work_payments USING(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid) WITH CHECK(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);
CREATE POLICY money_work_weeks_owner ON money_work_weeks USING(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid) WITH CHECK(user_id=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid);
