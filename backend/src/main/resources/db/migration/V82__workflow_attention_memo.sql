-- Independent memo revision prevents unrelated status/order edits from overwriting a memo.
-- Source-provided summaries remain in the existing source JSON; source keys are unchanged.
ALTER TABLE attention_items ADD COLUMN memo TEXT NOT NULL DEFAULT '';
ALTER TABLE attention_items ADD COLUMN memo_revision BIGINT NOT NULL DEFAULT 0 CHECK (memo_revision >= 0);
