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
  public JsonNode claim(Authentication auth, @RequestParam(required = false) UUID jobId, @RequestParam(defaultValue="") String policy) {
    return StudyCampaign.VERSION.equals(policy) ? engine.claimWorker(worker(auth),jobId,true) : engine.claimWorker(worker(auth),jobId);
  }

  @PostMapping("/jobs/{id}/heartbeat")
  public Map<String, Boolean> heartbeat(
      Authentication auth, @PathVariable UUID id, @RequestBody JsonNode input) {
    fields(input, "leaseToken");
    engine.heartbeat(worker(auth), id, UUID.fromString(text(input, "leaseToken", 36)));
    return Map.of("renewed", true);
  }

  @PostMapping("/jobs/{id}/reserve")
  public JsonNode reserve(Authentication auth,@PathVariable UUID id,@RequestBody JsonNode data){
    return engine.reserveCall(worker(auth),id,UUID.fromString(text(data,"leaseToken",36)));
  }
  @PostMapping("/jobs/{id}/result")
  public JsonNode result(Authentication auth,@PathVariable UUID id,@RequestBody JsonNode data){
    return engine.finishCall(worker(auth),id,UUID.fromString(text(data,"leaseToken",36)),data);
  }

  @PostMapping("/jobs/{id}/complete")
  public JsonNode complete(
      Authentication auth, @PathVariable UUID id, @RequestBody JsonNode input) {
    fields(input, "leaseToken", "output");
    return engine.complete(
        worker(auth), id, UUID.fromString(text(input, "leaseToken", 36)), input.path("output"));
  }
}
