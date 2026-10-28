package com.kafka.backend.morning;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
import static com.kafka.backend.morning.MorningVoiceContract.*;

@RestController
@RequestMapping("/api/orbit/morning/v1")
public class MorningVoiceController {
    private final MorningVoiceService service;
    public MorningVoiceController(MorningVoiceService service) { this.service = service; }
    @GetMapping("/capabilities") public ResponseEntity<Readiness> readiness() { return safe(service.readiness()); }
    @PostMapping("/voice-sessions/authorize")
    public ResponseEntity<Authorization> authorize(@Valid @RequestBody AuthorizeRequest request) { return safe(service.authorize(request)); }
    @GetMapping("/voice-sessions/{id}")
    public ResponseEntity<Session> session(@PathVariable UUID id) { return safe(service.find(id)); }
    @PostMapping("/voice-sessions/{id}/events")
    public ResponseEntity<Session> event(@PathVariable UUID id, @Valid @RequestBody EventRequest request) { return safe(service.event(id, request)); }
    @PostMapping("/voice-sessions/{id}/end")
    public ResponseEntity<Session> end(@PathVariable UUID id, @Valid @RequestBody EndRequest request) { return safe(service.end(id, request)); }
    private <T> ResponseEntity<T> safe(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Pragma", "no-cache").body(body); }
}
