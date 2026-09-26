package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
import static com.kafka.backend.money.MoneyWebTypes.*;

@RestController
@RequestMapping("/api/money")
public class MoneyWebController {
 private final MoneyWebService web;
 public MoneyWebController(MoneyWebService web){this.web=web;}
 @ExceptionHandler({java.time.DateTimeException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
 public ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("message","유효한 날짜 / 식별자를 입력하세요."));}
 @GetMapping("/overview") public Map<String,Object> overview(@RequestParam String from,@RequestParam String to){return web.overview(from,to);}
 @GetMapping("/bookkeeping") public Map<String,Object> books(@RequestParam String from,@RequestParam String to,@RequestParam(defaultValue="EXPENSE") String kind,@RequestParam(required=false) String search,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset,@RequestParam(defaultValue="false") boolean includeExcluded){return web.bookkeeping(from,to,kind,search,limit,offset,includeExcluded);}
 @GetMapping("/bookkeeping/{id}") public Map<String,Object> book(@PathVariable UUID id){return web.bookkeepingRow(id);}
 @PutMapping("/bookkeeping/{id}") public Map<String,Object> saveBook(@PathVariable UUID id,@RequestBody BookkeepingEdit v){return web.saveBookkeeping(id,v);}
 @GetMapping("/loans") public List<Loan> loans(){return web.loans();}
 @PostMapping("/loans") @ResponseStatus(HttpStatus.CREATED) public Loan createLoan(@RequestBody LoanInput v){return web.saveLoan(null,v);}
 @PutMapping("/loans/{id}") public Loan saveLoan(@PathVariable UUID id,@RequestBody LoanInput v){return web.saveLoan(id,v);}
 @DeleteMapping("/loans/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteLoan(@PathVariable UUID id,@RequestParam Long expectedVersion){web.deleteLoan(id,expectedVersion);}
 @PutMapping("/accounts/{id}/inclusion") public MoneyTypes.MoneyAccount inclusion(@PathVariable UUID id,@RequestBody AccountInclusion v){return web.inclusion(id,v);}
 @PostMapping("/notifications/{id}/defer") @ResponseStatus(HttpStatus.NO_CONTENT) public void defer(@PathVariable UUID id,@RequestBody MoneyProductService.Version v){web.deferReview(id,v.expectedVersion());}
}
