package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;
@RestController
@RequestMapping("/api/money/accounts/{accountId}/reconciliation-snapshot")
public class MoneyReconciliationReadController {
 private final MoneyReconciliationReadService service;
 public MoneyReconciliationReadController(MoneyReconciliationReadService service){this.service=service;}
 @GetMapping public Map<String,Object> snapshot(@PathVariable UUID accountId,@RequestParam(required=false) Instant cutoff,@RequestParam(required=false) String token,@RequestParam(required=false) String search,@RequestParam(defaultValue="0") int offset,@RequestParam(defaultValue="all") String scope){return service.snapshot(accountId,cutoff,token,search,offset,scope);}
}
