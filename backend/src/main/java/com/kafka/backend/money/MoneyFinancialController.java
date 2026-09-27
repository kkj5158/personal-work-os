package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/money")
public class MoneyFinancialController {
    private final MoneyFinancialService service;
    public MoneyFinancialController(MoneyFinancialService service){this.service=service;}
    @GetMapping("/accounts/{id}/calculated-balance")
    public MoneyProductService.Balance balance(@PathVariable UUID id,@RequestParam Instant asOf){return service.calculated(id,asOf);}
    @PostMapping("/accounts/{id}/balance-records") @ResponseStatus(HttpStatus.CREATED)
    public MoneyTypes.MoneyTransaction balance(@PathVariable UUID id,@RequestBody MoneyFinancialService.BalanceInput input){return service.balance(id,input);}
    @GetMapping("/transactions/{id}/financial-detail")
    public Map<String,Object> detail(@PathVariable UUID id){return service.detail(id);}
    @PostMapping("/loan-payments") @ResponseStatus(HttpStatus.CREATED)
    public MoneyTypes.MoneyTransaction payment(@RequestBody MoneyFinancialService.PaymentInput input){return service.payment(null,input);}
    @PutMapping("/transactions/{id}/loan-payment")
    public MoneyTypes.MoneyTransaction payment(@PathVariable UUID id,@RequestBody MoneyFinancialService.PaymentInput input){return service.payment(id,input);}
    @GetMapping("/loans/{id}/repayments")
    public List<Map<String,Object>> history(@PathVariable UUID id){return service.history(id);}
}
