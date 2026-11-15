package com.kafka.backend.money;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/money/account-ledger")
public class MoneyAccountLedgerController {
 private final MoneyAccountLedgerService service;
 public MoneyAccountLedgerController(MoneyAccountLedgerService service){this.service=service;}
 @ExceptionHandler({java.time.DateTimeException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
 public ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("message","유효한 기간과 단일 계좌를 선택하세요."));}
 @GetMapping public Map<String,Object> read(@RequestParam String from,@RequestParam String to,@RequestParam(required=false) UUID accountId,@RequestParam(required=false) String type,@RequestParam(defaultValue="ALL") String state,@RequestParam(required=false) String search,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset){return service.read(from,to,accountId,type,state,search,limit,offset);}
 @GetMapping("/pending") public Map<String,Object> pending(@RequestParam String from,@RequestParam String to,@RequestParam(required=false) UUID accountId,@RequestParam(required=false) String type,@RequestParam(defaultValue="ALL") String state,@RequestParam(required=false) String search,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset){return service.pending(from,to,accountId,type,state,search,limit,offset);}
 @GetMapping("/rows/{id}") public Map<String,Object> row(@PathVariable UUID id){return service.row(id);}
 @PostMapping("/rows/{id}/preview") public Map<String,Object> preview(@PathVariable UUID id,@RequestBody MoneyAccountLedgerService.EditRequest input){return service.preview(id,input);}
 @PostMapping("/rows/{id}/execute") public Map<String,Object> execute(@PathVariable UUID id,@RequestBody MoneyAccountLedgerService.EditRequest input){return service.execute(id,input);}
 @PostMapping("/rows/{id}/metadata") public Map<String,Object> metadata(@PathVariable UUID id,@RequestBody MoneyAccountLedgerService.Metadata input){return service.metadata(id,input);}
 @PostMapping("/rows/{id}/category") public Map<String,Object> category(@PathVariable UUID id,@RequestBody MoneyAccountLedgerService.Category input){return service.category(id,input);}
}
