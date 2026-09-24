-- CHECKLIST SYS V1: Identity -> Area -> Checklist Item, daily records, and
-- archive intervals shared with DIET SYS. Purely additive: no existing table
-- or row is modified. See docs/backend/checklist-sys.md.
--
-- Deletion is archive: items are never physically deleted while records
-- reference them (records FK has no cascade). UNTOUCHED is the absence of a
-- record row; SUCCESS / FAILURE / NOT_RECORDED are stored explicitly.
CREATE TABLE checklist_sys_identities (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id),
 name VARCHAR(100) NOT NULL CHECK(length(trim(name))>0),
 description VARCHAR(500) NOT NULL DEFAULT '',
 color VARCHAR(7) NOT NULL CHECK(color ~ '^#[0-9a-fA-F]{6}$'),
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id)
);
CREATE TABLE checklist_sys_areas (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id), identity_id UUID NOT NULL,
 name VARCHAR(100) NOT NULL CHECK(length(trim(name))>0),
 description VARCHAR(500) NOT NULL DEFAULT '',
 color VARCHAR(7) NOT NULL CHECK(color ~ '^#[0-9a-fA-F]{6}$'),
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id),
 FOREIGN KEY(owner_id,identity_id) REFERENCES checklist_sys_identities(owner_id,id)
);
CREATE TABLE checklist_sys_items (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id), area_id UUID NOT NULL,
 name VARCHAR(200) NOT NULL CHECK(length(trim(name))>0),
 description VARCHAR(2000) NOT NULL DEFAULT '',
 -- Classification/filter only: never a weight, ordering key or scoring rule.
 importance VARCHAR(12) NOT NULL CHECK(importance IN ('CORE','SECONDARY','OPTIONAL')),
 icon VARCHAR(40) NOT NULL,
 -- Explicit user order within the Area; independent from importance.
 sort_order INTEGER NOT NULL DEFAULT 0,
 start_date DATE NOT NULL,
 archived_on DATE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(owner_id,id),
 FOREIGN KEY(owner_id,area_id) REFERENCES checklist_sys_areas(owner_id,id)
);
CREATE TABLE checklist_sys_records (
 owner_id UUID NOT NULL, item_id UUID NOT NULL, entry_date DATE NOT NULL,
 state VARCHAR(12) NOT NULL CHECK(state IN ('SUCCESS','FAILURE','NOT_RECORDED')),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,item_id,entry_date),
 FOREIGN KEY(owner_id,item_id) REFERENCES checklist_sys_items(owner_id,id)
);
-- Inactive intervals [archived_on, restored_on). Untouched dates inside an
-- interval are neither failures nor missing data. One open interval per item.
CREATE TABLE checklist_archive_periods (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id),
 domain VARCHAR(12) NOT NULL CHECK(domain IN ('CHECKLIST','DIET')),
 item_id UUID NOT NULL, archived_on DATE NOT NULL, restored_on DATE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(restored_on IS NULL OR restored_on>=archived_on)
);
CREATE UNIQUE INDEX checklist_archive_periods_open ON checklist_archive_periods(owner_id,domain,item_id) WHERE restored_on IS NULL;
CREATE INDEX checklist_archive_periods_item ON checklist_archive_periods(owner_id,domain,item_id);
CREATE INDEX checklist_sys_areas_order ON checklist_sys_areas(owner_id,identity_id,sort_order);
CREATE INDEX checklist_sys_items_order ON checklist_sys_items(owner_id,area_id,sort_order);
CREATE INDEX checklist_sys_records_date ON checklist_sys_records(owner_id,entry_date);
-- API owns all access. No public PostgREST policies are granted.
ALTER TABLE checklist_sys_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_sys_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_sys_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_sys_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_archive_periods ENABLE ROW LEVEL SECURITY;
