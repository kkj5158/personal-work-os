package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/money/ai/classification")
public class MoneyClassificationController {
 private final MoneyClassificationService service;
 private final MoneyAiWorkspaceService workspace;
 public MoneyClassificationController(MoneyClassificationService service,MoneyAiWorkspaceService workspace){this.service=service;this.workspace=workspace;}
 @GetMapping("/outcomes/{id}") public Map<String,Object> outcome(@PathVariable UUID id){return service.outcome(id);}
 @GetMapping("/items/{id}") public Map<String,Object> state(@PathVariable UUID id){return service.state(id);}
 @GetMapping("/eligibility") public Map<String,Object> eligibility(@RequestParam List<UUID> ids){return service.eligibility(ids);}
 @PostMapping("/save") public Map<String,Object> classify(@RequestBody MoneyClassificationService.Bundle input){return service.classify(input);}
 @PostMapping("/request") public Map<String,Object> request(@RequestBody MoneyClassificationService.Bundle input){return service.request(input);}
 @PostMapping("/edit") public Map<String,Object> edit(@RequestBody MoneyClassificationService.Edit input){return service.edit(input);}
 @PostMapping("/reference-exclusion") public Map<String,Object> exclude(@RequestBody MoneyClassificationService.Exclusion input){return service.exclude(input);}
 @GetMapping("/history") public Map<String,Object> history(@RequestParam(defaultValue="0") int offset,@RequestParam(required=false) UUID transactionId,@RequestParam(required=false) UUID contextTransactionId,@RequestParam(required=false) String search,@RequestParam(required=false) UUID accountId,@RequestParam(required=false) String from,@RequestParam(required=false) String to,@RequestParam(required=false) String status){workspace.retain();return service.history(offset,transactionId,contextTransactionId,search,accountId,from,to,status);}
 @PostMapping("/undo-preview") public Map<String,Object> preview(@RequestBody List<UUID> ids){return service.undoPreview(ids);}
 @PostMapping("/undo") public Map<String,Object> undo(@RequestBody MoneyClassificationService.Undo input){return service.undo(input);}
}
