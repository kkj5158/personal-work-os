package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController @RequestMapping("/api/money/ai/history-runs")
public class MoneyAiHistoryController {
 private final MoneyAiHistoryService service;public MoneyAiHistoryController(MoneyAiHistoryService service){this.service=service;}
 @GetMapping public List<Map<String,Object>> list(){return service.list();}
 @PostMapping("/preview") public Map<String,Object> preview(@RequestBody MoneyAiHistoryService.Scope scope){return service.preview(scope);}
 @PostMapping public Map<String,Object> start(@RequestBody MoneyAiHistoryService.Start input){return service.start(input);}
 @GetMapping("/{id}") public Map<String,Object> read(@PathVariable UUID id,@RequestParam(defaultValue="0")int offset){return service.read(id,offset);}
 @PostMapping("/{id}/advance") public Map<String,Object> advance(@PathVariable UUID id){return service.advance(id);}
 @PostMapping("/control") public Map<String,Object> control(@RequestBody MoneyAiHistoryService.Control input){return service.control(input);}
}
