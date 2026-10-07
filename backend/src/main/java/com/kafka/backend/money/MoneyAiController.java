package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;

@RestController
@RequestMapping("/api/money/ai")
public class MoneyAiController {
 private final MoneyAiService ai;
 public MoneyAiController(MoneyAiService ai){this.ai=ai;}
 @ExceptionHandler({java.time.DateTimeException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class}) public ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("message","유효한 날짜·식별자를 입력하세요."));}
 @ExceptionHandler(org.springframework.dao.DataAccessException.class) public ResponseEntity<Map<String,String>> storage(org.springframework.dao.DataAccessException e){return ResponseEntity.status(e instanceof org.springframework.dao.DataIntegrityViolationException?409:500).body(Map.of("message","저장하지 못했습니다. 새로고침 후 다시 확인하세요."));}
 @GetMapping("/workbench") public Map<String,Object> workbench(@RequestParam(defaultValue="PENDING") String state,@RequestParam(required=false) String type,@RequestParam(required=false) String search,@RequestParam(required=false) UUID accountId,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset,@RequestParam(required=false) String reason){return ai.workbench(state,type,search,accountId,limit,offset,reason);}
 @GetMapping("/items/{id}") public Map<String,Object> item(@PathVariable UUID id,@RequestParam(defaultValue="TRANSACTION") String kind){return ai.item(id,kind,true);}
 @PostMapping("/decisions") public Map<String,Object> decide(@RequestBody MoneyAiService.Decision input){return ai.decide(input);}
 @PostMapping("/events/{id}/undo") public Map<String,Object> undo(@PathVariable UUID id){return ai.undo(id);}
 @GetMapping("/transfers") public Map<String,Object> transfers(){return ai.transfers();}
 @PostMapping("/transfers/confirm") public Map<String,Object> transfer(@RequestBody MoneyAiService.TransferInput input){return ai.confirmTransfer(input);}
 @PostMapping("/transfers/unrelated") public Map<String,Object> unrelated(@RequestBody MoneyReviewService.PairDismissal input){return ai.unrelated(input);}
 @GetMapping("/merchants") public Map<String,Object> merchants(){return ai.merchants();}
 @PostMapping("/merchants") public Map<String,Object> merchant(@RequestBody MoneyAiService.MerchantInput input){return ai.merchant(input);}
 @PostMapping("/merchant-rule") public Map<String,Object> merchantRule(@RequestBody MoneyAiService.MerchantRule input){return ai.merchantRule(input);}
 @GetMapping("/settings") public Map<String,Object> settings(){return ai.settings();}
 @PutMapping("/settings") public Map<String,Object> settings(@RequestBody MoneyAiService.SettingsInput input){return ai.settings(input);}
 @GetMapping("/operations") public Map<String,Object> operations(){return ai.operations();}
}
