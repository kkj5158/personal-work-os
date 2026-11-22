package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import java.math.BigDecimal;
import java.time.DateTimeException;
import java.util.*;
@RestController
@RequestMapping("/api/money/bookkeeping/unified")
public class MoneyUnifiedBookkeepingController {
 private final MoneyUnifiedBookkeepingService service;
 public MoneyUnifiedBookkeepingController(MoneyUnifiedBookkeepingService service){this.service=service;}
 @ExceptionHandler({DateTimeException.class,MethodArgumentTypeMismatchException.class})
 public ResponseEntity<Map<String,String>> invalidFilter(){
  return ResponseEntity.badRequest().body(Map.of("message","유효한 날짜와 거래 필터를 입력하세요."));
 }
 @GetMapping public Map<String,Object> ledger(@RequestParam String from,@RequestParam String to,@RequestParam(defaultValue="false") boolean unresolved,@RequestParam(required=false) String search,@RequestParam(required=false) String accountIds,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset,@RequestParam(required=false) String categoryIds,@RequestParam(required=false) String type,@RequestParam(required=false) BigDecimal minAmount,@RequestParam(required=false) BigDecimal maxAmount,@RequestParam(required=false) String repaymentGroup,@RequestParam(required=false) MoneyUnifiedBookkeepingService.RepaymentPart repaymentPart,@RequestParam(defaultValue="false") boolean bookkeepingScope,@RequestParam(required=false) String baseDirection){return service.ledger(from,to,unresolved,search,accountIds,limit,offset,categoryIds,type,minAmount,maxAmount,repaymentGroup,repaymentPart,bookkeepingScope,baseDirection);}
 @GetMapping("/loan-repayments")
 public MoneyUnifiedBookkeepingService.LoanRepaymentSummary loanRepayments(
     @RequestParam String from,@RequestParam String to,@RequestParam(required=false) String accountIds,@RequestParam(defaultValue="false") boolean bookkeepingScope){
  return service.loanRepayments(from,to,accountIds,bookkeepingScope);
 }
 @GetMapping("/pending") public Map<String,Object> pending(){return service.pending();}
 @GetMapping("/rows/{id}") public Map<String,Object> row(@PathVariable UUID id){return service.row(id);}
 @GetMapping("/candidates/{id}") public Map<String,Object> candidates(@PathVariable UUID id,@RequestParam String kind,@RequestParam(required=false) String search){return service.candidates(id,kind,search);}
 @PostMapping("/rows/{id}") public Map<String,Object> edit(@PathVariable UUID id,@RequestBody MoneyUnifiedBookkeepingService.Edit v){return service.edit(id,v);}
 @GetMapping("/outcomes/{id}") public Map<String,Object> outcome(@PathVariable UUID id){return service.outcome(id);}
 @PostMapping("/admit/{id}") public Map<String,Object> admit(@PathVariable UUID id,@RequestBody MoneyUnifiedBookkeepingService.Admit v){return service.admit(id,v);}
 @PostMapping("/bulk/preview") public Map<String,Object> preview(@RequestBody MoneyUnifiedBookkeepingService.Bulk v){return service.bulk(v,false);}
 @PostMapping("/bulk/execute") public Map<String,Object> execute(@RequestBody MoneyUnifiedBookkeepingService.Bulk v){return service.bulk(v,true);}
}
