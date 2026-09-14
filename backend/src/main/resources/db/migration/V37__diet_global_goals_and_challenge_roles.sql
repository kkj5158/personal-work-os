-- Global goals have an independent lifecycle. Keep legacy challenge goals intact.
CREATE TABLE diet_global_goals (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id),
 kind VARCHAR(12) NOT NULL CHECK(kind IN ('SHORT_TERM','WEEKLY','MONTHLY','FINAL')),
 target_date DATE NOT NULL, target_weight DOUBLE PRECISION NOT NULL CHECK(target_weight>0),
 core VARCHAR(2000) NOT NULL DEFAULT '', memo_items JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(memo_items)='array'),
 UNIQUE(owner_id,id)
);
INSERT INTO diet_global_goals(id,owner_id,kind,target_date,target_weight)
 SELECT id,owner_id,kind,entry_date,value FROM diet_goals WHERE challenge_id IS NULL;
CREATE INDEX diet_global_goals_date ON diet_global_goals(owner_id,target_date,id);
ALTER TABLE diet_global_goals ENABLE ROW LEVEL SECURITY;

ALTER TABLE diet_challenges ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'CURRENT_FOCUS'
 CHECK(role IN ('CURRENT_FOCUS','NEXT_FOCUS','FINAL_GOAL'));
UPDATE diet_challenges SET role='NEXT_FOCUS' WHERE status='WAITING';
ALTER TABLE diet_challenges ADD COLUMN home_sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE diet_challenges SET home_sort_order=sort_order;
CREATE INDEX diet_challenges_home_order ON diet_challenges(owner_id,type,home_sort_order,id);

ALTER TABLE diet_milestones ADD COLUMN memo_items JSONB NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(memo_items)='array');
-- Preserve an entire legacy memo as one bullet; do not infer delimiters and lose text.
UPDATE diet_milestones SET memo_items=jsonb_build_array(memo) WHERE length(trim(memo))>0;
