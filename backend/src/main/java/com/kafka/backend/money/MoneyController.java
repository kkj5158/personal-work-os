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
    public MoneyController(MoneyService service) { this.service=service; }
    @ExceptionHandler(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String,String>> invalidParameter() {
        return ResponseEntity.badRequest().body(Map.of("message","Invalid money query parameter or identifier"));
    }
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
    @GetMapping("/transactions") public List<MoneyTransaction> transactions(@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset) { return service.transactions(limit,offset); }
    @GetMapping("/transactions/{id}") public MoneyTransaction transaction(@PathVariable UUID id) { return service.transaction(id); }
}
