package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import java.util.List;
import java.util.UUID;
import java.util.Map;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/money/bridge")
public class MoneyBridgeController {
    private final MoneyBridgeService service;
    public MoneyBridgeController(MoneyBridgeService service){this.service=service;}
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String,String>> rejected(ResponseStatusException e){return ResponseEntity.status(e.getStatusCode()).cacheControl(CacheControl.noStore()).body(Map.of("message","Bridge request rejected"));}
    @ExceptionHandler(org.springframework.dao.DataAccessException.class)
    public ResponseEntity<Map<String,String>> storage(){return ResponseEntity.status(503).body(Map.of("message","Bridge registration temporarily unavailable"));}
    public record Exchange(String code,UUID installId){@Override public String toString(){return "Exchange[REDACTED]";}}
    @PostMapping("/enrollments") public ResponseEntity<MoneyBridgeService.Enrollment> enroll(){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.enroll());}
    @PostMapping("/exchange") public ResponseEntity<MoneyBridgeService.Credential> exchange(@RequestBody Exchange v){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.exchange(v.code(),v.installId()));}
    @GetMapping("/devices") public List<MoneyBridgeService.Device> devices(){return service.devices();}
    @DeleteMapping("/devices/{id}") public ResponseEntity<Void> revoke(@PathVariable UUID id){service.revoke(id);return ResponseEntity.noContent().build();}
}
