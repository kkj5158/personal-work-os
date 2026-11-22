package com.kafka.backend.study;

import static com.kafka.backend.study.StudyValidation.*;

import java.util.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.*;

@RestController
@RequestMapping("/api/study-worker")
class StudyWorkerController {
  final StudyEngine engine;

  StudyWorkerController(StudyEngine engine) {
    this.engine = engine;
  }

  StudyEngineWorker worker(Authentication a) {
    return (StudyEngineWorker) a.getPrincipal();
  }

  @PostMapping("/claim")
  public JsonNode claim(Authentication auth, @RequestParam(required = false) UUID jobId) {
    return engine.claimWorker(worker(auth), jobId);
  }

  @PostMapping("/jobs/{id}/heartbeat")
  public Map<String, Boolean> heartbeat(
      Authentication auth, @PathVariable UUID id, @RequestBody JsonNode input) {
    fields(input, "leaseToken");
    engine.heartbeat(worker(auth), id, UUID.fromString(text(input, "leaseToken", 36)));
    return Map.of("renewed", true);
  }

  @PostMapping("/jobs/{id}/complete")
  public JsonNode complete(
      Authentication auth, @PathVariable UUID id, @RequestBody JsonNode input) {
    fields(input, "leaseToken", "output");
    return engine.complete(
        worker(auth), id, UUID.fromString(text(input, "leaseToken", 36)), input.path("output"));
  }
}
