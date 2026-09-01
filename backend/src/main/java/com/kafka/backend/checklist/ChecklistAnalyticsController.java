package com.kafka.backend.checklist;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/checklist-analytics")
public class ChecklistAnalyticsController {

    private final ChecklistAnalyticsService service;

    public ChecklistAnalyticsController(ChecklistAnalyticsService service) {
        this.service = service;
    }

    @GetMapping("/overall")
    public List<AchievementPoint> overall(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return service.overallTrend(from, to);
    }

    @GetMapping("/by-item")
    public List<ItemBreakdownEntry> byItem(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ChecklistPriority priority,
            @RequestParam(defaultValue = "false") boolean includeDeleted
    ) {
        return service.byItem(from, to, priority, includeDeleted);
    }

    @GetMapping("/item/{itemId}")
    public List<ItemTrendPoint> item(
            @PathVariable UUID itemId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return service.itemTrend(itemId, from, to);
    }
}
