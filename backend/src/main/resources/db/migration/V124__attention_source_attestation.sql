ALTER TABLE attention_content_verifications
    ADD COLUMN source_attestation JSONB,
    ADD CONSTRAINT attention_source_attestation_object
        CHECK (source_attestation IS NULL OR jsonb_typeof(source_attestation) = 'object');
