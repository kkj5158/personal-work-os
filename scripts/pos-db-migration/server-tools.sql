BEGIN;
CREATE TEMP TABLE migration_tool_output(line text);
COPY migration_tool_output FROM PROGRAM 'pg_restore --version';
SELECT json_build_object('tool',line) FROM migration_tool_output;
ROLLBACK;
