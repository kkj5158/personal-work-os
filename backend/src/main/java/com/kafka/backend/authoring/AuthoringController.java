package com.kafka.backend.authoring;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static com.kafka.backend.authoring.AuthoringTypes.*;

@RestController
@RequestMapping("/api/authoring")
public class AuthoringController {
    private final AuthoringService service;
    private final AuthoringDefinitions definitions;
    public AuthoringController(AuthoringService service, AuthoringDefinitions definitions) {
        this.service = service; this.definitions = definitions;
    }
    @GetMapping("/programs") public List<Definition> programs() { return definitions.all(); }
    @GetMapping("/sessions") public List<Summary> sessions() { return service.list(); }
    @PostMapping("/sessions") @ResponseStatus(HttpStatus.CREATED)
    public Session create(@RequestBody CreateSession request) { return service.create(request); }
    @GetMapping("/sessions/{id}") public Session session(@PathVariable UUID id) { return service.get(id); }
    @PutMapping("/sessions/{id}") public Session save(@PathVariable UUID id, @RequestBody SaveSession request) {
        return service.save(id, request);
    }
    @PutMapping("/sessions/{id}/metadata") public Session metadata(@PathVariable UUID id, @RequestBody SaveMetadata request) {
        return service.saveMetadata(id, request);
    }
    @PostMapping("/sessions/{id}/complete") public Session complete(@PathVariable UUID id, @RequestBody CompleteSession request) {
        return service.complete(id, request);
    }
    @GetMapping("/sessions/{id}/recovery-export") public Map<String, Object> recoveryExport(@PathVariable UUID id) {
        return service.recoveryExport(id);
    }
}
