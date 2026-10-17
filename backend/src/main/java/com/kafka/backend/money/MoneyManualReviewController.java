package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import java.util.*;

/** Explicit, versioned owner assertion. Never invoked as an implicit transport fallback. */
@RestController
@RequestMapping("/api/money/review/manual/v2")
public class MoneyManualReviewController {
    private final MoneyManualReviewService service;
    public MoneyManualReviewController(MoneyManualReviewService service) { this.service=service; }
    @GetMapping("/{id}") public Map<String,Object> context(@PathVariable UUID id) { return service.context(id); }
    @PostMapping("/{id}") public Map<String,Object> confirm(@PathVariable UUID id,@RequestBody MoneyManualReviewService.Confirmation input) { return service.confirm(id,input); }
    @PostMapping("/transactions/{id}") public Map<String,Object> repair(@PathVariable UUID id,@RequestBody MoneyManualReviewService.Repair input) { return service.repair(id,input); }
}
