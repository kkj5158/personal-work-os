-- ============================================================
-- Workflow Calendar V1
-- ReflectionEntry: the single WORK_OS-owned Reflection table this
-- codebase's notesystem.integration.ReflectionProvider boundary
-- interface has been waiting on (see NoteSystemController's
-- "WORK_OS Reflection API가 아직 제공되지 않습니다" stub). One row per
-- (user_id, entry_date) — Note System's Daily Note may embed it via
-- ReflectionEmbed but never owns or duplicates this data.
--
-- content autosaves while status = EDITING. Completing generates
-- and freezes `snapshot` (structured JSON: plannedBlocks, actualBlocks,
-- stateBlocks, planned/actual/delta minutes, WORK/LIFE breakdown,
-- generatedAt) and flips status to COMPLETED; snapshot is
-- regenerated wholesale on every re-completion, never partially
-- patched. No revision history in V1 — snapshot is simply replaced.
--
-- version is a plain optimistic-lock counter (JPA @Version). Unlike
-- WorkRecord, this entity has no client-assigned id, so it needs
-- none of WorkRecord's Persistable/isNew workaround.
-- ============================================================

CREATE TABLE reflection_entries (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    entry_date DATE NOT NULL,

    content TEXT NOT NULL DEFAULT '',
    status VARCHAR(10) NOT NULL DEFAULT 'EDITING',
    snapshot JSONB,

    version INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_reflection_entries_user
        FOREIGN KEY (user_id)
            REFERENCES auth.users(id)
            ON DELETE CASCADE,

    CONSTRAINT chk_reflection_entries_status
        CHECK (status IN ('EDITING', 'COMPLETED')),

    CONSTRAINT uq_reflection_entries_user_date
        UNIQUE (user_id, entry_date)
);

CREATE INDEX idx_reflection_entries_user_date
    ON reflection_entries (user_id, entry_date);
