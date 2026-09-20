-- Phase 2 only. Reuse the existing private raster store.
ALTER TABLE journal_media ADD COLUMN diet_owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE journal_media DROP CONSTRAINT chk_media_domain;
ALTER TABLE journal_media ADD CONSTRAINT chk_media_domain CHECK (num_nonnulls(workspace_id,workflow_owner_id,diet_owner_id)=1);
CREATE INDEX idx_journal_media_diet_owner ON journal_media(diet_owner_id);

CREATE TABLE diet_gallery_sections (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title VARCHAR(200) NOT NULL, description VARCHAR(2000) NOT NULL DEFAULT '',
 sort_order INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(owner_id,id)
);
CREATE TABLE diet_gallery_columns (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL, section_id UUID NOT NULL,
 title VARCHAR(200) NOT NULL, sort_order INTEGER NOT NULL, UNIQUE(owner_id,id),
 FOREIGN KEY(owner_id,section_id) REFERENCES diet_gallery_sections(owner_id,id) ON DELETE CASCADE
);
CREATE TABLE diet_gallery_blocks (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL, column_id UUID NOT NULL,
 type VARCHAR(8) NOT NULL CHECK(type IN ('IMAGE','TEXT')),
 media_id UUID UNIQUE REFERENCES journal_media(id), text VARCHAR(4000), sort_order INTEGER NOT NULL,
 FOREIGN KEY(owner_id,column_id) REFERENCES diet_gallery_columns(owner_id,id) ON DELETE CASCADE,
 CHECK ((type='IMAGE' AND media_id IS NOT NULL AND text IS NULL) OR (type='TEXT' AND media_id IS NULL AND text IS NOT NULL))
);
CREATE TABLE diet_identity_blocks (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 title VARCHAR(200) NOT NULL, body VARCHAR(6000) NOT NULL DEFAULT '', sort_order INTEGER NOT NULL
);
CREATE INDEX idx_diet_gallery_sections_order ON diet_gallery_sections(owner_id,sort_order);
CREATE INDEX idx_diet_gallery_columns_order ON diet_gallery_columns(owner_id,section_id,sort_order);
CREATE INDEX idx_diet_gallery_blocks_order ON diet_gallery_blocks(owner_id,column_id,sort_order);
CREATE INDEX idx_diet_identity_order ON diet_identity_blocks(owner_id,sort_order);
ALTER TABLE diet_gallery_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_gallery_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_gallery_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_identity_blocks ENABLE ROW LEVEL SECURITY;
