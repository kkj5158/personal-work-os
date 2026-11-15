package com.kafka.backend.study;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "study_records")
class StudyRecord {
  @Id UUID id = UUID.randomUUID();

  @Column(name = "owner_id")
  UUID ownerId;

  String kind;

  @Column(name = "record_key", length = 1000)
  String recordKey;

  @Column(name = "workbook_row")
  UUID workbookRow;

  @Column(columnDefinition = "text")
  String payload;

  @Column(name = "created_at")
  Instant createdAt = Instant.now();
}
