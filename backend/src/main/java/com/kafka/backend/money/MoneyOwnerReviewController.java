package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/money/review/owner")
public class MoneyOwnerReviewController {
 private final MoneyOwnerReviewService service;
 private final MoneyReconciliationReadService reconciliation;
 public MoneyOwnerReviewController(MoneyOwnerReviewService service,MoneyReconciliationReadService reconciliation){this.service=service;this.reconciliation=reconciliation;}
 @GetMapping("/{id}/diagnostic") public Map<String,Object> diagnostic(@PathVariable UUID id){return reconciliation.ownerDiagnostic(id);}
 @GetMapping("/{id}") public Map<String,Object> context(@PathVariable UUID id){return service.context(id);}
 @GetMapping("/{id}/duplicates") public Map<String,Object> duplicates(@PathVariable UUID id,@RequestParam UUID accountId,@RequestParam java.math.BigDecimal amount,@RequestParam String currency,@RequestParam java.time.Instant occurredAt){return service.duplicates(id,accountId,amount,currency,occurredAt);}
 @GetMapping("/{id}/refunds") public Map<String,Object> refunds(@PathVariable UUID id,@RequestParam(defaultValue="") String search,@RequestParam(required=false) String currency,@RequestParam(required=false) java.time.Instant occurredAt){return service.refunds(id,search,currency,occurredAt);}
 @PostMapping("/{id}") public Map<String,Object> decide(@PathVariable UUID id,@RequestBody MoneyOwnerReviewService.Decision input){return service.decide(id,input);}
}
