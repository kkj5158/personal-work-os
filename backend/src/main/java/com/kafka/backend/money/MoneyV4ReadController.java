package com.kafka.backend.money;

import java.time.LocalDate;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/money/v4")
public class MoneyV4ReadController {
    private final MoneyV4ReadService reads;
    private final MoneyStatisticalAccountService accounts;

    public MoneyV4ReadController(MoneyV4ReadService reads, MoneyStatisticalAccountService accounts) {
        this.reads = reads;
        this.accounts = accounts;
    }

    @GetMapping("/summary")
    public MoneyV4ReadService.Metrics summary(@RequestParam LocalDate from, @RequestParam LocalDate to,
                                               @RequestParam(defaultValue="KRW") String currency, @RequestParam(required=false) String accountIds) {
        return reads.summary(from, to, currency, accountIds);
    }

    @GetMapping("/savings-balance")
    public Object savingsBalance(@RequestParam(defaultValue="KRW") String currency) { return reads.savingsBalance(currency); }

    @GetMapping("/income-composition")
    public MoneyV4ReadService.IncomeComposition incomeComposition(@RequestParam LocalDate from,
            @RequestParam LocalDate to, @RequestParam(defaultValue="KRW") String currency,
            @RequestParam(required=false) String accountIds) {
        return reads.incomeComposition(from, to, currency, accountIds);
    }

    @GetMapping("/composition-preference")
    public MoneyV4ReadService.ChartPreference chartPreference() { return reads.chartPreference(); }

    @PutMapping("/composition-preference")
    public MoneyV4ReadService.ChartPreference updateChartPreference(@RequestBody MoneyV4ReadService.ChartPreferenceChange change) {
        return reads.updateChartPreference(change);
    }

    @GetMapping("/statistical-balances")
    public MoneyStatisticalAccountService.Snapshot statisticalBalances(@RequestParam LocalDate to,
            @RequestParam(defaultValue="KRW") String currency, @RequestParam(required=false) String accountIds,
            @RequestParam(required=false) Instant asOf) {
        return accounts.snapshot(to, currency, accountIds, asOf);
    }

    @GetMapping("/statistical-purposes")
    public List<MoneyStatisticalAccountService.Setting> statisticalPurposes() { return accounts.settings(); }

    @PutMapping("/statistical-purposes/{accountId}")
    public MoneyStatisticalAccountService.Setting setStatisticalPurpose(@PathVariable UUID accountId,
            @RequestBody MoneyStatisticalAccountService.Change change) {
        return accounts.update(accountId, change);
    }

    @GetMapping("/contributions")
    public Object contributions(@RequestParam LocalDate from, @RequestParam LocalDate to,
                                @RequestParam(defaultValue="KRW") String currency, @RequestParam String bucket,
                                @RequestParam(required=false) String accountIds, @RequestParam(required=false) String category,
                                @RequestParam(required=false) String loan, @RequestParam(required=false) String search,
                                @RequestParam(defaultValue="50") int limit, @RequestParam(defaultValue="0") int offset) {
        return reads.items(from, to, currency, bucket, accountIds, category, loan, search, limit, offset);
    }
}
