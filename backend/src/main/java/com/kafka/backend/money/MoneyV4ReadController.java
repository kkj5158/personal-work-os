package com.kafka.backend.money;

import java.time.LocalDate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/money/v4")
public class MoneyV4ReadController {
    private final MoneyV4ReadService reads;

    public MoneyV4ReadController(MoneyV4ReadService reads) { this.reads = reads; }

    @GetMapping("/summary")
    public MoneyV4ReadService.Metrics summary(@RequestParam LocalDate from, @RequestParam LocalDate to,
                                               @RequestParam(defaultValue="KRW") String currency, @RequestParam(required=false) String accountIds) {
        return reads.summary(from, to, currency, accountIds);
    }

    @GetMapping("/savings-balance")
    public Object savingsBalance(@RequestParam(defaultValue="KRW") String currency) { return reads.savingsBalance(currency); }

    @GetMapping("/contributions")
    public Object contributions(@RequestParam LocalDate from, @RequestParam LocalDate to,
                                @RequestParam(defaultValue="KRW") String currency, @RequestParam String bucket,
                                @RequestParam(required=false) String accountIds, @RequestParam(required=false) String category,
                                @RequestParam(required=false) String loan, @RequestParam(required=false) String search,
                                @RequestParam(defaultValue="50") int limit, @RequestParam(defaultValue="0") int offset) {
        return reads.items(from, to, currency, bucket, accountIds, category, loan, search, limit, offset);
    }
}
