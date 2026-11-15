-- Additive STUDY-only storage. JSON contains validated versioned contracts, never file bytes.
CREATE TABLE study_workspaces (
 owner_id uuid PRIMARY KEY REFERENCES auth.users(id), revision bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE study_workbooks (
 row_id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES study_workspaces(owner_id),
 workbook_id varchar(180) NOT NULL, workbook_version integer NOT NULL CHECK(workbook_version > 0),
 study_date date NOT NULL, payload text NOT NULL, answer_keys text NOT NULL, published boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,workbook_id,workbook_version), UNIQUE(owner_id,study_date,workbook_version), UNIQUE(owner_id,row_id)
);
CREATE TABLE study_records (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES study_workspaces(owner_id),
 kind varchar(20) NOT NULL CHECK(kind IN ('MATERIAL','MATERIAL_VERSION','DRAFT','ATTEMPT','POLICY','PROPOSAL','FEEDBACK','REVIEW','AUTOMATION','RECEIPT')),
 record_key varchar(1000) NOT NULL, workbook_row uuid, payload text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,kind,record_key), UNIQUE(owner_id,id),
 FOREIGN KEY(owner_id,workbook_row) REFERENCES study_workbooks(owner_id,row_id),
 CHECK(kind NOT IN ('DRAFT','ATTEMPT','REVIEW') OR workbook_row IS NOT NULL)
);
CREATE INDEX study_records_owner_kind ON study_records(owner_id,kind,created_at);
CREATE TABLE study_assets (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES study_workspaces(owner_id),
 purpose varchar(20) NOT NULL CHECK(purpose IN ('material','handwritten','question','answer')),
 workbook_row uuid, material_row uuid, display_name varchar(180) NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 104857600), mime varchar(80) NOT NULL,
 sha256 varchar(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 staging_key text NOT NULL, final_key text NOT NULL,
 state varchar(20) NOT NULL CHECK(state IN ('UPLOADING','READY','FAILED','DELETED','ATTACHED')),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,workbook_row) REFERENCES study_workbooks(owner_id,row_id),
 FOREIGN KEY(owner_id,material_row) REFERENCES study_records(owner_id,id),
 CHECK((purpose='material' AND material_row IS NOT NULL AND workbook_row IS NULL)
    OR (purpose<>'material' AND workbook_row IS NOT NULL AND material_row IS NULL)),
 CHECK(purpose<>'handwritten' OR size_bytes<=20971520)
);
CREATE INDEX study_assets_owner_state ON study_assets(owner_id,state,expires_at);
-- Business access goes through Spring Boot. In particular PostgREST must never bypass answer review.
ALTER TABLE study_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_workbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_assets ENABLE ROW LEVEL SECURITY;
-- No browser-role policies are granted. The backend migration/owner role retains normal access.
