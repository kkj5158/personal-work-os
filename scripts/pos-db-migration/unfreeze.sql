BEGIN READ WRITE;
ALTER ROLE postgres RESET default_transaction_read_only;
COMMIT;
SELECT json_build_object('restored',true,'at',clock_timestamp());
