package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/money")
public class MoneyBalanceObservationController {
 private final MoneyBalanceObservationService service; private final MoneyReconciliationSummaryService summary; private final MoneyProductService product;
 public MoneyBalanceObservationController(MoneyBalanceObservationService service,MoneyReconciliationSummaryService summary,MoneyProductService product){this.service=service;this.summary=summary;this.product=product;}
 @GetMapping("/reconciliation-summary") public MoneyReconciliationSummaryService.Dashboard summary(){return summary.summary();}
 @GetMapping("/accounts/table-preferences") public MoneyBalanceObservationService.Preferences preferences(){return service.preferences();}
 @PutMapping("/accounts/table-preferences") public MoneyBalanceObservationService.Preferences preferences(@RequestBody MoneyBalanceObservationService.PreferenceInput v){return service.preferences(v);}
 @GetMapping("/accounts/{account}/observations") public List<MoneyBalanceObservationService.Observation> history(@PathVariable UUID account){return service.history(account);}
 @GetMapping("/accounts/{account}/bank-observations") public List<Map<String,Object>> bankHistory(@PathVariable UUID account){service.history(account);return product.notificationObservations().stream().filter(v->account.equals(v.get("accountId"))).sorted(Comparator.comparing(v->(java.time.Instant)v.get("at"),Comparator.reverseOrder())).toList();}
 @PostMapping("/accounts/{account}/observations") public MoneyBalanceObservationService.Observation create(@PathVariable UUID account,@RequestBody MoneyBalanceObservationService.Input v){return service.create(account,v);}
 @PutMapping("/accounts/{account}/observations/{id}") public MoneyBalanceObservationService.Observation edit(@PathVariable UUID account,@PathVariable UUID id,@RequestBody MoneyBalanceObservationService.Input v){return service.edit(account,id,v);}
 @PostMapping("/accounts/{account}/observations/{id}/cancel") public MoneyBalanceObservationService.Observation cancel(@PathVariable UUID account,@PathVariable UUID id,@RequestBody MoneyBalanceObservationService.StateInput v){return service.state(account,id,v,true);}
 @PostMapping("/accounts/{account}/observations/{id}/restore") public MoneyBalanceObservationService.Observation restore(@PathVariable UUID account,@PathVariable UUID id,@RequestBody MoneyBalanceObservationService.StateInput v){return service.state(account,id,v,false);}
 @GetMapping("/accounts/{account}/observations/{id}/revisions") public List<Map<String,Object>> revisions(@PathVariable UUID account,@PathVariable UUID id){return service.revisions(account,id);}
}
