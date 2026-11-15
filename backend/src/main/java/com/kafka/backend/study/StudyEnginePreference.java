package com.kafka.backend.study;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "study_engine_preferences")
class StudyEnginePreference {
  @Id
  @Column(name = "owner_id")
  UUID ownerId;

  @Column(columnDefinition = "text")
  String payload;
}
