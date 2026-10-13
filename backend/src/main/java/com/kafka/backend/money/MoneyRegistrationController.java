package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/money/registration")
public class MoneyRegistrationController {
 private final MoneyRegistrationService service;
 public MoneyRegistrationController(MoneyRegistrationService service){this.service=service;}
 @GetMapping("/{id}/history") public Map<String,Object> history(@PathVariable UUID id){return service.history(id);}
 @GetMapping("/{id}/context") public Map<String,Object> context(@PathVariable UUID id){return service.context(id);}
 @PostMapping("/{id}/cancel") public Map<String,Object> cancel(@PathVariable UUID id,@RequestBody MoneyRegistrationService.Change input){return service.change(id,input,false);}
 @PostMapping("/{id}/restore") public Map<String,Object> restore(@PathVariable UUID id,@RequestBody MoneyRegistrationService.Change input){return service.change(id,input,true);}
 @GetMapping("/cancelled") public Map<String,Object> cancelled(@RequestParam(required=false) String search,@RequestParam(required=false) String from,@RequestParam(required=false) String to,@RequestParam(required=false) UUID accountId,@RequestParam(required=false) UUID categoryId,@RequestParam(defaultValue="0") int offset){return service.cancelled(search,from,to,accountId,categoryId,offset);}
}
