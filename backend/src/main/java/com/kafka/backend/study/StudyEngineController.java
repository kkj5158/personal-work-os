package com.kafka.backend.study;

import static com.kafka.backend.study.StudyValidation.*;

import java.util.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.*;

@RestController
@RequestMapping("/api/study/engine")
class StudyEngineController {
  final StudyEngine engine;

  StudyEngineController(StudyEngine engine) {
    this.engine = engine;
  }

  @GetMapping
  public JsonNode status() {
    return engine.status();
  }

  @PostMapping("/goals")
  public JsonNode goals(@RequestBody JsonNode input) {
    return engine.configureGoals(input);
  }

  @PostMapping("/index/{asset}")
  public JsonNode index(@PathVariable UUID asset, @RequestBody(required = false) JsonNode input) {
    if (input == null) return engine.index(asset);
    fields(input, "materialVersion");
    return engine.index(asset, input.has("materialVersion") ? positive(input, "materialVersion") : null);
  }

  @GetMapping("/jobs")
  public JsonNode history(@RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "") String kind, @RequestParam(defaultValue = "") String state,
      @RequestParam(defaultValue = "") String date, @RequestParam(defaultValue = "") String week) {
    return engine.history(page, kind, state, date, week);
  }

  @GetMapping("/preview")
  public JsonNode preview(@RequestParam String date) { return engine.preview(java.time.LocalDate.parse(date)); }

  @GetMapping("/sources/{material}/search")
  public List<?> search(
      @PathVariable String material,
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(required = false) UUID job) {
    return engine.search(material, job, q, page);
  }

  @GetMapping("/excerpts/{id}")
  public JsonNode excerpt(@PathVariable UUID id) {
    return engine.passage(id);
  }

  @PostMapping("/plan")
  public List<?> plan(@RequestBody JsonNode input) {
    return engine.plan(input);
  }

  @GetMapping("/jobs/{id}/draft")
  public JsonNode draft(@PathVariable UUID id,@RequestParam(defaultValue="false") boolean answers){return engine.campaignPreview(id,answers);}
  @GetMapping("/jobs/{id}/draft.pdf")
  public org.springframework.http.ResponseEntity<byte[]> draftPdf(@PathVariable UUID id,@RequestParam(defaultValue="false") boolean answers) throws java.io.IOException {
    return org.springframework.http.ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
      .contentType(org.springframework.http.MediaType.APPLICATION_PDF).body(engine.campaignPdf(id,answers));
  }

  @PostMapping("/jobs/{id}/approve")
  public JsonNode approve(@PathVariable UUID id) {
    return engine.approve(id);
  }

  @PostMapping("/jobs/{id}/reissue")
  public JsonNode reissue(@PathVariable UUID id, @RequestBody JsonNode input) {
    return engine.reissue(id, input);
  }

  @PostMapping("/jobs/{id}/retry")
  public JsonNode retry(@PathVariable UUID id) {
    return engine.retry(id);
  }

  @PostMapping("/jobs/{id}/cancel")
  public JsonNode cancel(@PathVariable UUID id) {
    return engine.cancel(id);
  }

  @PostMapping("/jobs/{id}/run")
  public Map<String, Boolean> run(@PathVariable UUID id) {
    engine.run(id);
    return Map.of("checked", true);
  }

  @PostMapping("/feedback/{id}/analyze")
  public JsonNode analyze(@PathVariable String id) {
    return engine.analyze(id);
  }

  @PostMapping("/workers")
  public JsonNode worker(@RequestBody JsonNode input) {
    fields(input, "label");
    return engine.mintWorker(text(input, "label", 120));
  }

  @PostMapping("/workers/{id}/revoke")
  public Map<String, Boolean> revoke(@PathVariable UUID id) {
    engine.revoke(id);
    return Map.of("revoked", true);
  }
}
