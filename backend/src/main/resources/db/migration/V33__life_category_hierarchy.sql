-- Existing LIFE categories remain roots; no records or identities change.
ALTER TABLE life_categories ADD COLUMN parent_id UUID;
ALTER TABLE life_categories ADD CONSTRAINT fk_life_categories_parent_owner FOREIGN KEY (parent_id, user_id) REFERENCES life_categories(id, user_id);
ALTER TABLE life_categories ADD CONSTRAINT chk_life_category_not_self_parent CHECK (parent_id IS DISTINCT FROM id);
CREATE INDEX idx_life_categories_parent ON life_categories(user_id, parent_id, sort_order);
