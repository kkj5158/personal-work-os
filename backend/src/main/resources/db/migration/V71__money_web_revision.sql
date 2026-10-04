-- Additive presentation metadata: no category IDs, parent links, assignments or history are rewritten.
CREATE TABLE money_category_groups (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name VARCHAR(80) NOT NULL, kind VARCHAR(8) NOT NULL CHECK(kind IN ('INCOME','EXPENSE')),
 sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order>=0), archived BOOLEAN NOT NULL DEFAULT false,
 icon_type VARCHAR(8), icon_value VARCHAR(64), version BIGINT NOT NULL DEFAULT 0,
 UNIQUE(id,user_id), UNIQUE(user_id,kind,name),
 CHECK((icon_type IS NULL AND icon_value IS NULL) OR (icon_type IN ('EMOJI','ICON') AND icon_value IS NOT NULL))
);
ALTER TABLE money_category_groups ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION money_category_group_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.user_id<>OLD.user_id OR NEW.kind<>OLD.kind THEN
  RAISE EXCEPTION 'Structural group owner/kind is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER money_category_group_identity BEFORE UPDATE ON money_category_groups FOR EACH ROW EXECUTE FUNCTION money_category_group_identity_guard();
ALTER TABLE money_categories ADD COLUMN structural_group_id UUID,
 ADD COLUMN icon_type VARCHAR(8), ADD COLUMN icon_value VARCHAR(64),
 ADD CONSTRAINT money_category_structural_owner FOREIGN KEY(structural_group_id,user_id) REFERENCES money_category_groups(id,user_id),
 ADD CHECK((icon_type IS NULL AND icon_value IS NULL) OR (icon_type IN ('EMOJI','ICON') AND icon_value IS NOT NULL)),
 ADD CHECK(parent_id IS NULL OR structural_group_id IS NULL);
CREATE FUNCTION money_category_structural_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.structural_group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM money_category_groups g WHERE g.id=NEW.structural_group_id AND g.user_id=NEW.user_id AND g.kind=NEW.kind) THEN
  RAISE EXCEPTION 'Structural group requires owned same-kind root' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER money_category_structural BEFORE INSERT OR UPDATE ON money_categories FOR EACH ROW EXECUTE FUNCTION money_category_structural_guard();
CREATE TABLE money_overview_preferences (
 user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 account_ids UUID[] NOT NULL DEFAULT '{}', version BIGINT NOT NULL DEFAULT 0,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(cardinality(account_ids)<=10)
);
ALTER TABLE money_overview_preferences ENABLE ROW LEVEL SECURITY;
