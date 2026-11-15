package com.kafka.backend.study;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "study_engine_workers")
class StudyEngineWorker {
  @Id UUID id = UUID.randomUUID();

  @Column(name = "owner_id")
  UUID ownerId;

  @Column(name = "token_hash")
  String tokenHash;

  String label;

  @Column(name = "expires_at")
  Instant expiresAt;

  @Column(name = "last_seen")
  Instant lastSeen;

  boolean revoked;
}
