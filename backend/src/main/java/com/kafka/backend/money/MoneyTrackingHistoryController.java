package com.kafka.backend.money;

import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/money/tracking/history")
public class MoneyTrackingHistoryController {
    private final MoneyTrackingHistoryService service;
    public MoneyTrackingHistoryController(MoneyTrackingHistoryService service){this.service=service;}
    @PostMapping("/preview") public Map<String,Object> preview(@RequestBody MoneyTrackingHistoryService.Change change){return service.preview(change);}
    @PostMapping("/apply") public Map<String,Object> apply(@RequestBody MoneyTrackingHistoryService.Approval approval){return service.apply(approval);}
}
