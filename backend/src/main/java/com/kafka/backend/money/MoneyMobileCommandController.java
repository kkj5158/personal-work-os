package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import java.util.*;

/** Normal owner JWT chain only; never accessible with an ingest-only Bridge token. */
@RestController
@RequestMapping("/api/money/mobile")
public class MoneyMobileCommandController {
    private final MoneyMobileCommandService commands;
    public MoneyMobileCommandController(MoneyMobileCommandService commands) { this.commands=commands; }
    @PostMapping("/entries") public Map<String,Object> create(@RequestBody MoneyMobileCommandService.QuickEntry input) { return commands.create(input); }
    @GetMapping("/commands/{requestId}") public Map<String,Object> outcome(@PathVariable UUID requestId) { return commands.outcome(requestId); }
    @PostMapping("/review-decisions") public Map<String,Object> decide(@RequestBody MoneyMobileCommandService.ReviewDecision input) { return commands.decide(input); }
    @PostMapping("/raw-confirmations") public Map<String,Object> confirm(@RequestBody MoneyMobileCommandService.RawConfirmation input) { return commands.confirm(input); }
    @PostMapping("/review-undo") public Map<String,Object> undo(@RequestBody MoneyMobileCommandService.Undo input) { return commands.undo(input); }
    @PostMapping("/book-meaning") public Map<String,Object> book(@RequestBody MoneyMobileCommandService.BookMeaning input) { return commands.book(input); }
}
