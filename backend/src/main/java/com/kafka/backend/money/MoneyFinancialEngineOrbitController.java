package com.kafka.backend.money;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.web.bind.annotation.*;

import static com.kafka.backend.money.MoneyFinancialEngineService.*;

@RestController
@RequestMapping("/api/orbit/money/v1/financial-engine")
public class MoneyFinancialEngineOrbitController {
    private static final List<String> LEDGER_FIELDS = List.of("id", "version", "type", "meaning_state", "display_type",
            "occurred_at", "amount", "currency", "direction", "from_account_id", "to_account_id", "sourceCount",
            "baseFinancialType", "declaredFinancialType", "relationStatus", "meaningApplied", "categoryEligible");
    private final MoneyV4ReadService metrics;
    private final MoneyStatisticalAccountService statisticalAccounts;
    private final MoneyFinancialEngineService engine;
    private final MoneyAccountLedgerService ledger;
    private final MoneyOrbitConsoleService console;

    public MoneyFinancialEngineOrbitController(MoneyFinancialEngineService engine, MoneyAccountLedgerService ledger,
            MoneyOrbitConsoleService console, MoneyV4ReadService metrics, MoneyStatisticalAccountService statisticalAccounts) {
        this.metrics = metrics;
        this.engine = engine;
        this.ledger = ledger;
        this.console = console;
        this.statisticalAccounts = statisticalAccounts;
    }

    @GetMapping("/summary")
    public Object summary(@RequestParam java.time.LocalDate from,@RequestParam java.time.LocalDate to,
                          @RequestParam(defaultValue="KRW") String currency,@RequestParam(required=false) UUID accountId) {
        MoneyService.require(!from.isAfter(to) && java.time.temporal.ChronoUnit.DAYS.between(from,to)<=366,"조회 기간을 확인하세요.");
        return console.envelope(metrics.summary(from,to,currency,accountId==null?null:accountId.toString()));
    }

    @GetMapping("/savings-balance")
    public Object savingsBalance(@RequestParam(defaultValue="KRW") String currency) { return console.envelope(metrics.savingsBalance(currency)); }

    @GetMapping("/composition")
    public Object composition(@RequestParam java.time.LocalDate from, @RequestParam java.time.LocalDate to,
            @RequestParam(defaultValue="KRW") String currency, @RequestParam(required=false) String accountIds,
            @RequestParam(required=false) java.time.Instant asOf) {
        MoneyService.require(!from.isAfter(to) && java.time.temporal.ChronoUnit.DAYS.between(from,to)<=366,"조회 기간을 확인하세요.");
        return console.envelope(Map.of("flows",metrics.summary(from,to,currency,accountIds),
            "incomeComposition",metrics.incomeComposition(from,to,currency,accountIds),
            "balances",statisticalAccounts.snapshot(to,currency,accountIds,asOf)));
    }

    @GetMapping("/ledger")
    public Object ledger(@RequestParam String from, @RequestParam String to, @RequestParam(required = false) UUID accountId,
            @RequestParam(defaultValue = "25") int limit, @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "ALL") String state) {
        MoneyService.require(limit > 0 && limit <= 50 && offset >= 0 && offset <= 10000, "조회 범위를 확인하세요.");
        var result = ledger.read(from, to, accountId, null, state, null, limit, offset);
        var rows = (List<?>) result.get("items");
        var safeRows = rows.stream().map(row -> {
            var entry = (Map<?, ?>) row;
            var safe = new LinkedHashMap<String, Object>();
            for (var field : LEDGER_FIELDS) safe.put(field, entry.get(field));
            return safe;
        }).toList();
        return console.envelope(Map.of("items", safeRows, "total", result.get("total")));
    }

    @GetMapping("/candidates")
    public Object candidates(@RequestParam(defaultValue = "25") int limit, @RequestParam(defaultValue = "0") int offset) {
        return console.envelope(engine.candidates(limit, offset));
    }

    public record Intent(UUID id, UUID requestId, Long expectedVersion, String financialType, Boolean requireApplied) {}

    @PostMapping("/intent")
    public Object intent(@RequestBody Intent input) {
        MoneyService.require(input != null && input.id() != null && input.requestId() != null
                && input.expectedVersion() != null && input.expectedVersion() >= 0
                && input.financialType() != null && List.of("INCOME","EXPENSE","TRANSFER").contains(input.financialType()),
                "거래와 버전, 수입·지출·이체 중 하나를 선택하세요.");
        var result = ledger.financialType(input.id(), new MoneyAccountLedgerService.FinancialType(
            input.requestId(), input.expectedVersion(), input.financialType(), null, input.requireApplied()));
        return console.envelope(intentReceipt(result));
    }

    static Map<String,Object> intentReceipt(Map<?,?> result) {
        var safe = new LinkedHashMap<String,Object>();
        for (var field : List.of("requestId","transactionId","currentVersion","status","intentSaved",
                "meaningApplied","declaredFinancialType","baseFinancialType","canonicalType","relationStatus","message","reason")) {
            if (result.containsKey(field)) safe.put(field,result.get(field));
        }
        return safe;
    }

    @GetMapping("/status")
    public Object status() { return console.envelope(engine.status()); }

    @GetMapping("/history")
    public Object history(@RequestParam UUID id) { return console.envelope(engine.history(id)); }

    @GetMapping("/rules")
    public Object rules() { return console.envelope(engine.rules()); }

    @GetMapping("/backfill-preview")
    public Object backfill(@RequestParam(defaultValue = "25") int limit, @RequestParam(defaultValue = "0") int offset) {
        return console.envelope(engine.backfillPreview(limit, offset));
    }

    @GetMapping("/shadow-run")
    public Object shadowRun(@RequestParam UUID id, @RequestParam(defaultValue = "25") int limit,
            @RequestParam(defaultValue = "0") int offset) { return console.envelope(engine.shadowRun(id, limit, offset)); }

    @PostMapping("/shadow")
    public Object shadow(@RequestBody MoneyFinancialEngineController.ShadowRequest request) {
        return console.envelope(engine.shadow(request.requestId()));
    }

    @PostMapping("/save-rule")
    public Object saveRule(@RequestBody RuleInput request) { return console.envelope(engine.saveRule(request)); }

    @PostMapping("/batch-preview")
    public Object batchPreview(@RequestBody BatchInput request) { return console.envelope(engine.batchPreview(request)); }

    @PostMapping("/batch-execute")
    public Object batchExecute(@RequestBody BatchExecute request) { return console.envelope(engine.batchExecute(request)); }

    @PostMapping("/quick-confirm")
    public Object quickConfirm(@RequestBody BatchExecute request) {
        return console.envelope(engine.quickConfirm(request));
    }
}
