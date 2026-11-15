package com.kafka.backend.study;

import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class StudyEngineScheduler {
  final StudyEngine engine;

  StudyEngineScheduler(StudyEngine engine) {
    this.engine = engine;
  }

  @Scheduled(
      fixedDelayString = "${STUDY_ENGINE_POLL_MS:30000}",
      initialDelayString = "${STUDY_ENGINE_INITIAL_DELAY_MS:60000}")
  void poll() {
    engine.tick(Instant.now());
  }
}
