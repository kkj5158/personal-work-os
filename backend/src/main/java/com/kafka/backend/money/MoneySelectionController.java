package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;import java.util.*;
@RestController
@RequestMapping("/api/money/ai/classification/recommendations/selection")
public class MoneySelectionController {
 private final MoneySelectionService service;public MoneySelectionController(MoneySelectionService service){this.service=service;}
 @GetMapping public Map<String,Object> read(@RequestParam String scope){return service.read(scope);}
 @PutMapping public Map<String,Object> save(@RequestBody MoneySelectionService.Selection input){return service.save(input);}
}
