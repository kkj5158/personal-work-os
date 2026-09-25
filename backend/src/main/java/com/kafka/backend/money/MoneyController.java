package com.kafka.backend.money;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static com.kafka.backend.money.MoneyTypes.*;

@RestController
@RequestMapping("/api/money")
public class MoneyController {
    private final MoneyService service;
    private final MoneyProductService product;
    public MoneyController(MoneyService service,MoneyProductService product) { this.service=service;this.product=product; }
    @ExceptionHandler(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String,String>> invalidParameter() {
        return ResponseEntity.badRequest().body(Map.of("message","Invalid money query parameter or identifier"));
    }
    @ExceptionHandler(java.time.DateTimeException.class) public ResponseEntity<Map<String,String>> invalidDate(){return ResponseEntity.badRequest().body(Map.of("message","Use a valid date or month"));}
    @ExceptionHandler(org.springframework.dao.DataAccessException.class) public ResponseEntity<Map<String,String>> storageError(org.springframework.dao.DataAccessException e){return ResponseEntity.status(e instanceof org.springframework.dao.DataIntegrityViolationException?409:500).body(Map.of("message","Money data could not be saved. Reload and retry."));}
    @GetMapping("/accounts") public List<MoneyAccount> accounts() { return service.accounts(); }
    @GetMapping("/accounts/{id}") public MoneyAccount account(@PathVariable UUID id) { return service.account(id); }
    @PostMapping("/accounts") @ResponseStatus(HttpStatus.CREATED)
    public MoneyAccount createAccount(@RequestBody AccountInput input) { return service.createAccount(input); }
    @PutMapping("/accounts/{id}") public MoneyAccount updateAccount(@PathVariable UUID id,@RequestBody AccountUpdate input) { return service.updateAccount(id,input); }
    @PutMapping("/accounts/{id}/archive") public MoneyAccount archiveAccount(@PathVariable UUID id,@RequestBody ArchiveAccount input) { return service.archiveAccount(id,input); }
    @PostMapping("/notifications") public ResponseEntity<IngestResult> ingest(@RequestBody Map<String,Object> payload) {
        var result=service.ingest(payload);
        return ResponseEntity.status(result.created()?HttpStatus.CREATED:HttpStatus.OK).body(result);
    }
    @GetMapping("/notifications") public List<MoneyRawNotification> notifications(
            @RequestParam(required=false) ProcessingState state,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset) {
        return service.notifications(state,limit,offset);
    }
    @GetMapping("/notifications/{id}") public MoneyRawNotification notification(@PathVariable UUID id) { return service.notification(id); }
    @GetMapping("/notifications/{id}/parse-attempts") public List<ParseAttempt> attempts(@PathVariable UUID id) { return service.attempts(id); }
    @GetMapping("/transactions") public MoneyProductService.Page transactions(@RequestParam(required=false) String from,@RequestParam(required=false) String to,@RequestParam(required=false) UUID accountId,@RequestParam(required=false) UUID categoryId,@RequestParam(required=false) TransactionType type,@RequestParam(required=false) String search,@RequestParam(defaultValue="false") boolean includeExcluded,@RequestParam(defaultValue="false") boolean uncategorized,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset) {return product.transactions(from,to,accountId,categoryId,type,search,includeExcluded,limit,offset,uncategorized);}
    @GetMapping("/transactions/{id}") public MoneyTransaction transaction(@PathVariable UUID id) { return service.transaction(id); }

    @GetMapping("/dashboard") public Map<String,Object> dashboard(@RequestParam String month){return product.dashboard(month);}
    @GetMapping("/account-balances") public List<Map<String,Object>> balances(){return product.accountBalances();}
    @GetMapping("/accounts/{id}/detail") public MoneyProductService.AccountView detail(@PathVariable UUID id,@RequestParam String month){return product.accountDetail(id,month);}
    @PostMapping("/accounts/{id}/balance-checkpoints") public MoneyProductService.Balance balance(@PathVariable UUID id,@RequestBody MoneyProductService.Checkpoint v){return product.checkpoint(id,v);}
    @GetMapping("/categories") public List<MoneyProductService.Category> categories(){return product.categories();}
    @PostMapping("/categories/defaults") public List<MoneyProductService.Category> defaults(){return product.initializeCategories();}
    @PostMapping("/categories") public MoneyProductService.Category category(@RequestBody MoneyProductService.CategoryInput v){return product.saveCategory(null,v);}
    @PutMapping("/categories/{id}") public MoneyProductService.Category category(@PathVariable UUID id,@RequestBody MoneyProductService.CategoryInput v){return product.saveCategory(id,v);}
    @GetMapping("/category-rules") public List<MoneyProductService.Rule> rules(){return product.rules();}
    @PostMapping("/category-rules") public MoneyProductService.Rule rule(@RequestBody MoneyProductService.RuleInput v){return product.saveRule(null,v);}
    @PutMapping("/category-rules/{id}") public MoneyProductService.Rule rule(@PathVariable UUID id,@RequestBody MoneyProductService.RuleInput v){return product.saveRule(id,v);}
    @DeleteMapping("/category-rules/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteRule(@PathVariable UUID id,@RequestParam Long expectedVersion){product.deleteRule(id,expectedVersion);}
    @PostMapping("/transactions") @ResponseStatus(HttpStatus.CREATED) public MoneyTransaction create(@RequestBody MoneyProductService.Entry v){return product.save(null,v);}
    @PutMapping("/transactions/{id}") public MoneyTransaction update(@PathVariable UUID id,@RequestBody MoneyProductService.Entry v){return product.save(id,v);}
    @GetMapping("/transactions/{id}/corrections") public List<Map<String,Object>> corrections(@PathVariable UUID id){return product.corrections(id);}
    @PostMapping("/transactions/{id}/link-transfer") public MoneyTransaction link(@PathVariable UUID id,@RequestBody MoneyProductService.Pair v){return product.link(id,v);}
    @PostMapping("/transactions/{id}/unlink-transfer") public List<MoneyTransaction> unlink(@PathVariable UUID id,@RequestBody MoneyProductService.Version v){return product.unlink(id,v.expectedVersion());}
    @GetMapping("/review") public Map<String,Object> review(@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset){return product.review(limit,offset);}
    @PostMapping("/review/confirm") public MoneyTransaction review(@RequestBody MoneyProductService.ReviewPost v){return product.reviewPost(v);}
    @PostMapping("/notifications/{id}/exclude") @ResponseStatus(HttpStatus.NO_CONTENT) public void exclude(@PathVariable UUID id,@RequestBody MoneyProductService.Version v){product.reviewExclude(id,v.expectedVersion());}
    @PostMapping("/notifications/{id}/reprocess") @ResponseStatus(HttpStatus.NO_CONTENT) public void reprocess(@PathVariable UUID id,@RequestBody MoneyProductService.Version v){product.reprocess(id,v.expectedVersion());}
    @GetMapping("/connection-status") public Map<String,Object> status(){return product.status();}
}
