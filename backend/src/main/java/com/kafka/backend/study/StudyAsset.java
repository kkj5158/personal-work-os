package com.kafka.backend.study;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "study_assets")
class StudyAsset {
  @Id UUID id = UUID.randomUUID();

  @Column(name = "owner_id")
  UUID ownerId;

  String purpose;

  @Column(name = "workbook_row")
  UUID workbookRow;

  @Column(name = "material_row")
  UUID materialRow;

  @Column(name = "display_name")
  String displayName;

  @Column(name = "size_bytes")
  long sizeBytes;

  String mime, sha256, state;

  @Column(name = "staging_key")
  String stagingKey;

  @Column(name = "final_key")
  String finalKey;

  @Column(name = "expires_at")
  Instant expiresAt;

  @Column(name = "created_at")
  Instant createdAt = Instant.now();
}
