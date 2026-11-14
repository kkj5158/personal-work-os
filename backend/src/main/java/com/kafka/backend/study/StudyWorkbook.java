package com.kafka.backend.study;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "study_workbooks")
class StudyWorkbook {
  @Id
  @Column(name = "row_id")
  UUID rowId = UUID.randomUUID();

  @Column(name = "owner_id")
  UUID ownerId;

  @Column(name = "workbook_id")
  String workbookId;

  @Column(name = "workbook_version")
  int workbookVersion;

  @Column(columnDefinition = "text")
  String payload;

  @Column(name = "answer_keys", columnDefinition = "text")
  String answerKeys;

  @Column(name = "study_date")
  java.time.LocalDate studyDate;

  boolean published;

  @Column(name = "created_at")
  Instant createdAt = Instant.now();
}
