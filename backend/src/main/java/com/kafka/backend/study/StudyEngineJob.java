package com.kafka.backend.study;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "study_engine_jobs")
class StudyEngineJob {
  @Id UUID id = UUID.randomUUID();

  @Column(name = "owner_id")
  UUID ownerId;

  String kind;

  @Column(name = "job_key")
  String jobKey;

  String state = "QUEUED";

  @Column(columnDefinition = "text")
  String input;

  @Column(columnDefinition = "text")
  String result;

  @Column(columnDefinition = "text")
  String receipt = "{}";

  int attempts, checkpoint;

  @Column(name = "manual_retries")
  int manualRetries;

  @Column(name = "lease_token")
  UUID leaseToken;

  @Column(name = "lease_until")
  Instant leaseUntil;

  @Column(name = "worker_id")
  UUID workerId;

  @Column(name = "created_at")
  Instant createdAt = Instant.now();

  @Column(name = "updated_at")
  Instant updatedAt = Instant.now();
}
