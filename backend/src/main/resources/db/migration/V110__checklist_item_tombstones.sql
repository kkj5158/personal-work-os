-- Keep item identity/metadata and every historical record; no cascade or data rewrite.
ALTER TABLE checklist_sys_items ADD COLUMN deleted_on DATE;
