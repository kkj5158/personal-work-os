package com.kafka.backend.money;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/money/account-ledger/observed-directions")
public class MoneyObservedDirectionController {
    private final MoneyObservedDirectionService service;

    public MoneyObservedDirectionController(MoneyObservedDirectionService service) { this.service=service; }

    @GetMapping("/inventory")
    public List<MoneyObservedDirectionService.Candidate> inventory() { return service.inventory(); }

    @PostMapping("/{id}/reverse")
    public Map<String,Object> reverse(@PathVariable UUID id,@RequestBody MoneyObservedDirectionService.Reverse input) {
        return service.reverse(id,input);
    }

    @PostMapping("/{id}")
    public Map<String,Object> register(@PathVariable UUID id,@RequestBody MoneyObservedDirectionService.Register input) {
        return service.register(id,input);
    }
}
