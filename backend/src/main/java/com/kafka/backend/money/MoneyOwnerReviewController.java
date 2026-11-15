package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/money/review/owner")
public class MoneyOwnerReviewController {
 private final MoneyOwnerReviewService service;
 public MoneyOwnerReviewController(MoneyOwnerReviewService service){this.service=service;}
 @GetMapping("/{id}") public Map<String,Object> context(@PathVariable UUID id){return service.context(id);}
 @GetMapping("/{id}/refunds") public Map<String,Object> refunds(@PathVariable UUID id,@RequestParam(defaultValue="") String search){return service.refunds(id,search);}
 @PostMapping("/{id}") public Map<String,Object> decide(@PathVariable UUID id,@RequestBody MoneyOwnerReviewService.Decision input){return service.decide(id,input);}
}
