-- Additive V3 projection. No historic attention item is rewritten.
ALTER TABLE attention_lanes ADD COLUMN queue_role VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
    CHECK (queue_role IN ('ACTIVE','DEFERRED'));
-- Persist the saved deferred lane identity; later renames/orders cannot change it.
UPDATE attention_lanes SET queue_role='DEFERRED' WHERE name='나중에 확인';
ALTER TABLE attention_items ADD COLUMN active_group VARCHAR(10)
    CHECK (active_group IN ('ACTIVE','DEFERRED'));
CREATE INDEX attention_items_feed_idx ON attention_items(user_id,created_at DESC,id DESC)
    WHERE status IN ('OPEN','COMPLETED');
