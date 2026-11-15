package com.kafka.backend.log;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/log")
public class LogController {
  final LogService s;

  public LogController(LogService s) {
    this.s = s;
  }

  @GetMapping("/state")
  public Map<String, Object> state() {
    return s.state();
  }

  @PostMapping("/profiles")
  public Map<String, Object> create(@RequestBody Map<String, Object> b) {
    return s.createProfile(b);
  }

  @PutMapping("/profiles/{p}")
  public Map<String, Object> update(@PathVariable UUID p, @RequestBody Map<String, Object> b) {
    return s.updateProfile(p, b);
  }

  @PutMapping("/profiles/{p}/active")
  public Map<String, Object> active(@PathVariable UUID p) {
    return s.activate(p);
  }

  @PostMapping("/profiles/{p}/delete")
  public Map<String, Object> delete(@PathVariable UUID p, @RequestBody Map<String, Object> b) {
    return s.deleteProfile(p, b);
  }

  @GetMapping("/profiles/{p}/posts")
  public Map<String, Object> feed(
      @PathVariable UUID p,
      @RequestParam(defaultValue = "threads") String filter,
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "0") int offset,
      @RequestParam(defaultValue = "30") int limit) {
    return s.feed(p, filter, q, offset, limit);
  }

  @GetMapping("/profiles/{p}/posts/{id}")
  public Map<String, Object> post(@PathVariable UUID p, @PathVariable UUID id) {
    return s.getPost(p, id);
  }

  @PostMapping("/profiles/{p}/posts")
  public Map<String, Object> post(@PathVariable UUID p, @RequestBody Map<String, Object> b) {
    return s.createPost(p, b);
  }

  @PutMapping("/profiles/{p}/posts/{id}")
  public Map<String, Object> edit(
      @PathVariable UUID p, @PathVariable UUID id, @RequestBody Map<String, Object> b) {
    return s.updatePost(p, id, b);
  }

  @PatchMapping("/profiles/{p}/posts/{id}")
  public Map<String, Object> action(
      @PathVariable UUID p, @PathVariable UUID id, @RequestBody Map<String, Object> b) {
    return s.action(p, id, b);
  }

  @PostMapping("/profiles/{p}/posts/{id}/delete")
  public ResponseEntity<Void> deletePost(
      @PathVariable UUID p, @PathVariable UUID id, @RequestBody Map<String, Object> b) {
    s.deletePost(p, id, b);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/profiles/{p}/posts/{id}/replies")
  public Map<String, Object> replies(
      @PathVariable UUID p, @PathVariable UUID id, @RequestParam(defaultValue = "0") int offset) {
    return s.replies(p, id, offset);
  }

  @PostMapping("/profiles/{p}/posts/{id}/replies")
  public Map<String, Object> reply(
      @PathVariable UUID p, @PathVariable UUID id, @RequestBody Map<String, Object> b) {
    return s.createReply(p, id, b);
  }

  @PutMapping("/profiles/{p}/posts/{id}/replies/{r}")
  public Map<String, Object> reply(
      @PathVariable UUID p,
      @PathVariable UUID id,
      @PathVariable UUID r,
      @RequestBody Map<String, Object> b) {
    return s.updateReply(p, id, r, b, false);
  }

  @PostMapping("/profiles/{p}/posts/{id}/replies/{r}/delete")
  public Map<String, Object> deleteReply(
      @PathVariable UUID p,
      @PathVariable UUID id,
      @PathVariable UUID r,
      @RequestBody Map<String, Object> b) {
    return s.updateReply(p, id, r, b, true);
  }

  @GetMapping("/profiles/{p}/draft")
  public Map<String, Object> draft(@PathVariable UUID p) {
    return s.draft(p);
  }

  @GetMapping("/profiles/{p}/reply-feed")
  public Map<String, Object> replyFeed(
      @PathVariable UUID p,
      @RequestParam(defaultValue = "0") int offset,
      @RequestParam(defaultValue = "30") int limit) {
    return s.replyFeed(p, offset, limit);
  }

  @PutMapping("/profiles/{p}/draft")
  public Map<String, Object> draft(@PathVariable UUID p, @RequestBody Map<String, Object> b) {
    return s.saveDraft(p, b);
  }

  @PostMapping("/profiles/{p}/images")
  public Map<String, Object> ticket(@PathVariable UUID p, @RequestBody Map<String, Object> b) {
    return s.ticket(p, b);
  }

  @PostMapping("/profiles/{p}/images/{id}/complete")
  public Map<String, Object> complete(@PathVariable UUID p, @PathVariable UUID id) {
    return s.complete(p, id);
  }

  @PutMapping(value = "/profiles/{p}/images/{id}/bytes", consumes = "application/octet-stream")
  public ResponseEntity<Void> upload(
      @PathVariable UUID p, @PathVariable UUID id, @RequestBody byte[] bytes) {
    if (bytes.length > 18 * 1024 * 1024) throw LogService.error(413, "사진은 18MB 이하만 첨부할 수 있습니다.");
    s.upload(p, id, bytes);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/profiles/{p}/images/{id}")
  public ResponseEntity<byte[]> image(@PathVariable UUID p, @PathVariable UUID id) {
    var image = s.download(p, id);
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .contentType(MediaType.parseMediaType(image.mime()))
        .body(image.bytes());
  }
}
