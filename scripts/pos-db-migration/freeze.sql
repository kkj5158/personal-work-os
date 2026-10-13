SELECT json_build_object('kind','before','at',clock_timestamp(),'role',current_user,'defaultReadOnly',current_setting('default_transaction_read_only'),'roleConfig',(SELECT rolconfig FROM pg_roles WHERE rolname=current_user));
ALTER ROLE postgres SET default_transaction_read_only TO 'on';
SELECT json_build_object('kind','terminated','pid',pid,'application',application_name,'success',pg_terminate_backend(pid)) FROM pg_stat_activity WHERE datname=current_database() AND usename='postgres' AND application_name='PostgreSQL JDBC Driver' AND pid<>pg_backend_pid();
SELECT json_build_object('kind','remainingAppConnections','count',count(*)) FROM pg_stat_activity WHERE datname=current_database() AND application_name='PostgreSQL JDBC Driver';
