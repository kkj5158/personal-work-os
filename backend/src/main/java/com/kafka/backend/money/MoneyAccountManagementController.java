package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/money/accounts")
public class MoneyAccountManagementController {
 private final MoneyAccountManagementService service;
 public MoneyAccountManagementController(MoneyAccountManagementService service){this.service=service;}
 @GetMapping("/{id}/fund-history") public List<MoneyAccountManagementService.FundHistory> history(@PathVariable UUID id){return service.history(id);}
 @GetMapping("/{id}/deletion-eligibility") public MoneyAccountManagementService.DeletionEligibility eligibility(@PathVariable UUID id){return service.eligibility(id);}
 @PostMapping("/{id}/delete") public Map<String,Boolean> delete(@PathVariable UUID id,@RequestBody MoneyAccountManagementService.DeleteInput input){service.delete(id,input);return Map.of("deleted",true);}
}
