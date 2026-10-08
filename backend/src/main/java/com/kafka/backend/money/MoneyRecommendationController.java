package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/money/ai/classification/recommendations")
public class MoneyRecommendationController {
 private final MoneyRecommendationService service;
 public MoneyRecommendationController(MoneyRecommendationService service){this.service=service;}
 @PostMapping("/preview") public Map<String,Object> preview(@RequestBody MoneyRecommendationService.Preview input){return service.preview(input);}
 @PostMapping("/start") public Map<String,Object> start(@RequestBody MoneyRecommendationService.Start input){return service.start(input);}
 @GetMapping("/runs") public Map<String,Object> runs(){return service.runs();}
 @GetMapping("/runs/{id}") public Map<String,Object> run(@PathVariable UUID id){return service.run(id);}
 @GetMapping("/runs/{id}/items") public Map<String,Object> items(@PathVariable UUID id,@RequestParam(defaultValue="0") int offset){return service.items(id,offset);}
 @PostMapping("/items/{id}/recovery") public Map<String,Object> recovery(@PathVariable UUID id,@RequestBody MoneyRecommendationService.Recovery input){return service.recover(id,input);}
 @GetMapping("/drafts") public Map<String,Object> drafts(){return service.drafts();}
 @GetMapping("/history/{transactionId}") public Map<String,Object> history(@PathVariable UUID transactionId){return service.draftHistory(transactionId);}
 @GetMapping("/current/{id}") public Map<String,Object> current(@PathVariable UUID id){return service.current(id);}
 @PutMapping("/drafts/{id}/selection") public Map<String,Object> select(@PathVariable UUID id,@RequestBody MoneyRecommendationService.Selection input){return service.selection(id,input);}
 @PostMapping("/drafts/{id}/context") public Map<String,Object> context(@PathVariable UUID id,@RequestBody MoneyRecommendationService.ContextEdit input){return service.context(id,input);}
 @PostMapping("/drafts/{id}/decision") public Map<String,Object> decide(@PathVariable UUID id,@RequestBody MoneyRecommendationService.Decision input){return service.decision(id,input);}
 @PostMapping("/save") public Map<String,Object> save(@RequestBody MoneyRecommendationService.Save input){return service.save(input);}
 @GetMapping("/saves/{id}") public Map<String,Object> saved(@PathVariable UUID id){return service.saved(id);}
 @GetMapping("/saves") public Map<String,Object> saves(){return service.saves();}
 @GetMapping("/save-outcomes/{requestId}") public Map<String,Object> outcome(@PathVariable UUID requestId){return service.saveOutcome(requestId);}
 @PostMapping("/saves/{id}/retry") public Map<String,Object> retry(@PathVariable UUID id){return service.retry(id);}
 @PostMapping("/saves/{id}/recovery") public Map<String,Object> reconcile(@PathVariable UUID id){return service.reconcileSave(id);}
 @GetMapping("/usage") public Map<String,Object> usage(){return service.usage();}
}
