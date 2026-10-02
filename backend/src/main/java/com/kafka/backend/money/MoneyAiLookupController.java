package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/money/ai")
public class MoneyAiLookupController {
 private final MoneyAiLookupService service;
 public MoneyAiLookupController(MoneyAiLookupService service){this.service=service;}
 public record Lookup(String descriptor,String region){}
 @GetMapping("/provider") public Map<String,Object> status(){return service.status();}
 @PostMapping("/lookup") public Map<String,Object> lookup(@RequestBody Lookup input){return service.lookup(input.descriptor(),input.region());}
}
