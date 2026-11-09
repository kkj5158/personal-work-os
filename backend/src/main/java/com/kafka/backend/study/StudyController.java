package com.kafka.backend.study;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.*;

@RestController
@RequestMapping("/api/study")
public class StudyController {
  final StudyService service;
  final StudyFiles files;

  public StudyController(StudyService service, StudyFiles files) {
    this.service = service;
    this.files = files;
  }

  @GetMapping("/snapshot")
  public JsonNode snapshot() {
    return service.snapshot();
  }

  @GetMapping("/capabilities")
  public Map<String, Object> capabilities() {
    return files.capabilities();
  }

  @PostMapping("/commands")
  public JsonNode command(@RequestBody JsonNode request) {
    return service.command(request);
  }

  @PostMapping("/workbooks/{id}/{version}/review")
  public JsonNode review(
      @PathVariable String id, @PathVariable int version, @RequestParam String part) {
    return service.review(id, version, part);
  }

  @PostMapping("/workbooks/{id}/{version}/publish")
  public JsonNode publish(
      @PathVariable String id, @PathVariable int version, @RequestBody JsonNode request) {
    return files.publish(id, version, request);
  }

  @GetMapping("/assets")
  public List<?> assets() {
    return files.list();
  }

  @PostMapping("/assets")
  public JsonNode upload(@RequestBody JsonNode request) {
    return files.create(request);
  }

  @PostMapping("/assets/{id}/complete")
  public ResponseEntity<JsonNode> complete(@PathVariable UUID id, @RequestBody JsonNode request) {
    JsonNode result = files.complete(id, request);
    return ResponseEntity.status(result.path("state").asString().equals("FAILED") ? 422 : 200)
        .body(result);
  }

  @PostMapping("/assets/{id}/remove")
  public JsonNode remove(@PathVariable UUID id, @RequestBody JsonNode request) {
    return files.remove(id, request);
  }

  @PostMapping("/assets/reconcile")
  public Map<String, Object> reconcile() {
    return files.reconcile();
  }

  @GetMapping("/assets/{id}/content")
  public void content(@PathVariable UUID id, HttpServletResponse response) throws IOException {
    StudyAsset a = files.readable(id);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    response.setHeader(
        "Content-Disposition",
        com.kafka.backend.shareddesk.storage.S3ObjectStorage.disposition(a.displayName));
    response.setContentType("application/octet-stream");
    response.setContentLengthLong(a.sizeBytes);
    files.download(id, response.getOutputStream());
  }
}
