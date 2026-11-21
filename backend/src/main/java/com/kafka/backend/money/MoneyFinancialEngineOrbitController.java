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
            "occurred_at", "amount", "currency", "direction", "from_account_id", "to_account_id", "sourceCount");
    private final MoneyFinancialEngineService engine;
    private final MoneyAccountLedgerService ledger;
    private final MoneyOrbitConsoleService console;

    public MoneyFinancialEngineOrbitController(MoneyFinancialEngineService engine, MoneyAccountLedgerService ledger,
            MoneyOrbitConsoleService console) {
        this.engine = engine;
        this.ledger = ledger;
        this.console = console;
    }

    @GetMapping("/ledger")
    public Object ledger(@RequestParam String from, @RequestParam String to, @RequestParam(required = false) UUID accountId,
            @RequestParam(defaultValue = "25") int limit, @RequestParam(defaultValue = "0") int offset) {
        var result = ledger.read(from, to, accountId, null, "ALL", null, limit, offset);
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
