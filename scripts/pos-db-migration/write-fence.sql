BEGIN READ WRITE;
CREATE OR REPLACE FUNCTION public.pos_migration_20261014_write_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'POS business writes have moved to the environment-specific Railway database' USING ERRCODE='25006'; END;
$$;
DO $$ DECLARE item record; BEGIN
FOR item IN SELECT c.oid,n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p') AND (n.nspname='public' OR n.nspname LIKE 'qa_%' OR n.nspname LIKE 'sleep_%' OR n.nspname LIKE 'orbit_exercise_%')
ORDER BY n.nspname,c.relname LOOP
IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=item.oid AND tgname='pos_railway_migration_20261014') THEN
EXECUTE format('CREATE TRIGGER pos_railway_migration_20261014 BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION public.pos_migration_20261014_write_fence()',item.nspname,item.relname);
END IF; END LOOP; END $$;
COMMIT;
SELECT json_build_object('fencedTables',count(*),'at',clock_timestamp()) FROM pg_trigger WHERE tgname='pos_railway_migration_20261014';
