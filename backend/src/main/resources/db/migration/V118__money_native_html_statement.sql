-- Forward compatible format extension only; existing source/financial rows stay immutable.
ALTER TABLE money_statement_uploads DROP CONSTRAINT money_statement_uploads_format_check;
ALTER TABLE money_statement_uploads ADD CONSTRAINT money_statement_uploads_format_check
 CHECK (format IN ('PDF','CSV','XLSX','HTML_XLS'));
