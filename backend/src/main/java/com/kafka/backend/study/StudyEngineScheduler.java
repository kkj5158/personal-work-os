package com.kafka.backend.study;

import java.time.Instant;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class StudyEngineScheduler {
  final StudyEngine engine;
  final ExecutorService executor =
      Executors.newSingleThreadExecutor(Thread.ofPlatform().name("study-engine-worker").factory());
  final AtomicBoolean running = new AtomicBoolean();

  StudyEngineScheduler(StudyEngine engine) {
    this.engine = engine;
  }

  @Scheduled(
      fixedDelayString = "${STUDY_ENGINE_POLL_MS:30000}",
      initialDelayString = "${STUDY_ENGINE_INITIAL_DELAY_MS:60000}")
  void poll() {
    if (!running.compareAndSet(false, true)) return;
    executor.submit(
        () -> {
          try {
            engine.tick(Instant.now());
          } finally {
            running.set(false);
          }
        });
  }

  @jakarta.annotation.PreDestroy
  void close() {
    executor.shutdownNow();
  }
}
