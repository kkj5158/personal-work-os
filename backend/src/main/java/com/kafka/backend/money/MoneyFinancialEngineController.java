package com.kafka.backend.money;

import java.util.Map;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import static com.kafka.backend.money.MoneyFinancialEngineService.*;

@RestController
@RequestMapping("/api/money/financial-engine")
public class MoneyFinancialEngineController {
    private final MoneyFinancialEngineService engine;

    public MoneyFinancialEngineController(MoneyFinancialEngineService engine) {
        this.engine = engine;
    }

    public record ShadowRequest(UUID requestId) {}

    @GetMapping("/status")
    public Map<String, Object> status() { return engine.status(); }

    @GetMapping("/candidates")
    public Map<String, Object> candidates(@RequestParam(defaultValue = "25") int limit,
            @RequestParam(defaultValue = "0") int offset) { return engine.candidates(limit, offset); }

    @GetMapping("/history/{id}")
    public Map<String, Object> history(@PathVariable UUID id) { return engine.history(id); }

    @GetMapping("/rules")
    public Map<String, Object> rules() { return engine.rules(); }

    @PostMapping("/rules")
    public ResponseEntity<Map<String, Object>> rules(@RequestBody RuleInput request) {
        return outcome(engine.saveRule(request));
    }

    @PostMapping("/shadow-runs")
    public Map<String, Object> shadow(@RequestBody ShadowRequest request) { return engine.shadow(request.requestId()); }

    @GetMapping("/shadow-runs/{id}")
    public Map<String, Object> shadowRun(@PathVariable UUID id, @RequestParam(defaultValue = "25") int limit,
            @RequestParam(defaultValue = "0") int offset) { return engine.shadowRun(id, limit, offset); }

    @GetMapping("/backfill-preview")
    public Map<String, Object> backfill(@RequestParam(defaultValue = "25") int limit,
            @RequestParam(defaultValue = "0") int offset) { return engine.backfillPreview(limit, offset); }

    @PostMapping("/batch-preview")
    public Map<String, Object> batchPreview(@RequestBody BatchInput request) { return engine.batchPreview(request); }

    @PostMapping("/batch-execute")
    public ResponseEntity<Map<String, Object>> batchExecute(@RequestBody BatchExecute request) {
        return outcome(engine.batchExecute(request));
    }

    static ResponseEntity<Map<String, Object>> outcome(Map<String, Object> value) {
        if (value.get("result") instanceof Map<?, ?> result && "VERSION_CONFLICT".equals(result.get("reason"))) {
            return ResponseEntity.status(409).body(value);
        }
        return ResponseEntity.ok(value);
    }
}
