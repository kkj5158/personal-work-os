package com.kafka.backend.study;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "study_workspaces")
class StudyWorkspace {
  @Id
  @Column(name = "owner_id")
  UUID ownerId;

  @Version long revision;

  @Column(name = "updated_at")
  Instant updatedAt = Instant.now();

  protected StudyWorkspace() {}

  StudyWorkspace(UUID owner) {
    ownerId = owner;
  }
}
