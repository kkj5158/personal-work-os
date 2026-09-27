-- V62 unused in refreshed origin/dev, active worktrees and shared DEV V61.
-- Existing categories remain roots; no defaults or historical remapping.
ALTER TABLE money_categories ADD COLUMN parent_id UUID;
ALTER TABLE money_categories ADD CONSTRAINT money_category_parent_owner
 FOREIGN KEY(parent_id,user_id) REFERENCES money_categories(id,user_id);
ALTER TABLE money_categories ADD CHECK(parent_id IS NULL OR parent_id <> id);
ALTER TABLE money_categories DROP CONSTRAINT money_categories_user_id_name_key;
CREATE UNIQUE INDEX money_category_root_name ON money_categories(user_id,kind,name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX money_category_child_name ON money_categories(user_id,kind,parent_id,name) WHERE parent_id IS NOT NULL;
CREATE INDEX money_category_parent ON money_categories(user_id,parent_id);

CREATE FUNCTION money_category_hierarchy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent money_categories%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('money:' || NEW.user_id::text,0));
 IF TG_OP='UPDATE' THEN
  IF NEW.user_id<>OLD.user_id OR NEW.kind<>OLD.kind THEN
   RAISE EXCEPTION 'Category owner/kind is immutable' USING ERRCODE='23514';
  END IF;
  IF (OLD.parent_id IS NULL) <> (NEW.parent_id IS NULL) THEN
   RAISE EXCEPTION 'Category depth is immutable' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.parent_id IS NOT NULL THEN
  SELECT * INTO parent FROM money_categories WHERE id=NEW.parent_id AND user_id=NEW.user_id FOR UPDATE;
  IF NOT FOUND OR parent.parent_id IS NOT NULL OR parent.kind<>NEW.kind OR parent.id=NEW.id THEN
   RAISE EXCEPTION 'Category requires an owned same-kind root parent' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER money_category_hierarchy BEFORE INSERT OR UPDATE ON money_categories
 FOR EACH ROW EXECUTE FUNCTION money_category_hierarchy_guard();
