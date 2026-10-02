package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping("/api/money/ai/categories")
public class MoneyAiCategoryController {
 private final MoneyAiCategoryService service;
 public MoneyAiCategoryController(MoneyAiCategoryService service){this.service=service;}
 @GetMapping("/proposals") public Map<String,Object> proposals(){return service.proposals();}
 @GetMapping("/{id}/preview") public Map<String,Object> preview(@PathVariable UUID id,@RequestParam UUID targetId){return service.preview(id,targetId);}
 @PostMapping("/{id}/merge") public Map<String,Object> merge(@PathVariable UUID id,@RequestBody MoneyAiCategoryService.Merge input){return service.merge(id,input);}
 @PostMapping("/{id}/defer") public Map<String,Object> defer(@PathVariable UUID id,@RequestBody MoneyAiCategoryService.Defer input){return service.defer(id,input);}
}
