package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/money/review/batches")
public class MoneyReviewBatchController {
 private final MoneyReviewBatchService service;
 public MoneyReviewBatchController(MoneyReviewBatchService service){this.service=service;}
 @PostMapping("/preview") public Map<String,Object> preview(@RequestBody MoneyReviewBatchService.Preview input){return service.preview(input);}
 @PostMapping("/execute") public Map<String,Object> execute(@RequestBody MoneyReviewBatchService.Execute input){return service.execute(input);}
 @GetMapping("/outcomes/{requestId}") public Map<String,Object> outcome(@PathVariable UUID requestId){return service.outcome(requestId);}
}
