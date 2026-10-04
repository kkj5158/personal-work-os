package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/money")
public class MoneyWebRevisionController {
 @ExceptionHandler({java.time.DateTimeException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class}) public org.springframework.http.ResponseEntity<Map<String,String>> invalid(){return org.springframework.http.ResponseEntity.badRequest().body(Map.of("message","유효한 날짜 / 식별자를 입력하세요."));}
 private final MoneyWebRevisionService service;
 public MoneyWebRevisionController(MoneyWebRevisionService service){this.service=service;}
 @GetMapping("/category-groups") public List<MoneyWebRevisionService.Group> groups(){return service.groups();}
 @PostMapping("/category-groups") public MoneyWebRevisionService.Group create(@RequestBody MoneyWebRevisionService.GroupInput input){return service.saveGroup(null,input);}
 @PutMapping("/category-groups/{id}") public MoneyWebRevisionService.Group save(@PathVariable UUID id,@RequestBody MoneyWebRevisionService.GroupInput input){return service.saveGroup(id,input);}
 @PutMapping("/category-groups/order") public List<MoneyWebRevisionService.Group> order(@RequestBody MoneyWebRevisionService.Order input){return service.orderGroups(input);}
 @PutMapping("/categories/{id}/group") public MoneyProductService.Category mapping(@PathVariable UUID id,@RequestBody MoneyWebRevisionService.GroupMapping input){return service.mapGroup(id,input);}
 @GetMapping("/overview/preferences") public MoneyWebRevisionService.Preferences preferences(){return service.preferences();}
 @PutMapping("/overview/preferences") public MoneyWebRevisionService.Preferences preferences(@RequestBody MoneyWebRevisionService.PreferencesInput input){return service.savePreferences(input);}
 @GetMapping("/overview/current-stock") public Map<String,Object> stock(){return service.currentStock();}
 @GetMapping("/overview/spending-pace") public Map<String,Object> pace(@RequestParam String from,@RequestParam String to){return service.spendingPace(from,to);}
 @PutMapping("/accounts/{id}/fund") public MoneyMobileService.FundAccount fund(@PathVariable UUID id,@RequestBody MoneyMobileService.FundInput input){return service.saveFund(id,input);}
}
