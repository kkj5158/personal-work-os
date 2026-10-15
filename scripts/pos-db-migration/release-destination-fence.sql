BEGIN;
DROP FUNCTION public.pos_migration_20261014_write_fence() CASCADE;
SELECT json_build_object('remainingMigrationFences',count(*),'at',clock_timestamp()) FROM pg_trigger WHERE tgname='pos_railway_migration_20261014';
COMMIT;
