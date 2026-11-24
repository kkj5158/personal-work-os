package com.kafka.backend.money;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/money/account-ledger")
public class MoneyAccountLedgerController {
 private final MoneyAccountLedgerService service;
 public MoneyAccountLedgerController(MoneyAccountLedgerService service){this.service=service;}
 private void singleScope(jakarta.servlet.http.HttpServletRequest request){String[] values=request.getParameterValues("accountId");MoneyService.require(request.getParameter("accountIds")==null&&(values==null||values.length==1),"전체 또는 한 계좌만 선택하세요.");}
 @ExceptionHandler({java.time.DateTimeException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
 public ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("message","유효한 기간과 단일 계좌를 선택하세요."));}
 @GetMapping public Map<String,Object> read(@RequestParam String from,@RequestParam String to,@RequestParam(required=false) UUID accountId,@RequestParam(required=false) String type,@RequestParam(defaultValue="ALL") String state,@RequestParam(required=false) String search,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset,jakarta.servlet.http.HttpServletRequest request){singleScope(request);return service.read(from,to,accountId,type,state,search,limit,offset,request.getParameter("baseDirection"));}
 @GetMapping("/pending") public Map<String,Object> pending(@RequestParam String from,@RequestParam String to,@RequestParam(required=false) UUID accountId,@RequestParam(required=false) String type,@RequestParam(defaultValue="ALL") String state,@RequestParam(required=false) String search,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset,jakarta.servlet.http.HttpServletRequest request){singleScope(request);return service.pending(from,to,accountId,type,state,search,limit,offset,request.getParameter("baseDirection"));}
 @GetMapping("/rows/{id}") public Map<String,Object> row(@PathVariable UUID id){return service.row(id);}
 @PatchMapping("/rows/{id}/financial-type") public Map<String,Object> financialType(@PathVariable UUID id,@RequestBody MoneyAccountLedgerService.FinancialType input){return service.financialType(id,input);}
 @PatchMapping("/rows/{id}/financial-type/undo") public Map<String,Object> undoDirection(@PathVariable UUID id,@RequestBody MoneyAccountLedgerService.UndoDirection input){return service.undoDirection(id,input);}
 @PostMapping("/rows/{id}/preview") public Map<String,Object> preview(@PathVariable UUID id,@RequestBody MoneyAccountLedgerService.EditRequest input){return service.preview(id,input);}
 @PostMapping("/rows/{id}/execute") public Map<String,Object> execute(@PathVariable UUID id,@RequestBody MoneyAccountLedgerService.EditRequest input){return service.execute(id,input);}
 @PostMapping("/rows/{id}/metadata") public Map<String,Object> metadata(@PathVariable UUID id,@RequestBody MoneyAccountLedgerService.Metadata input){return service.metadata(id,input);}
 @PostMapping("/rows/{id}/category") public Map<String,Object> category(@PathVariable UUID id,@RequestBody MoneyAccountLedgerService.Category input){return service.category(id,input);}
}
