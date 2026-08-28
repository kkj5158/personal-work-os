package com.kafka.backend.workcharttarget;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/work-chart-targets")
public class WorkChartTargetController {

    private final WorkChartTargetService service;

    public WorkChartTargetController(WorkChartTargetService service) {
        this.service = service;
    }

    @GetMapping
    public WorkChartTargetResponse get() {
        return service.get();
    }

    @PutMapping
    public WorkChartTargetResponse update(@RequestBody WorkChartTargetRequest request) {
        return service.update(request.targetWorkMinutes(), request.targetScore());
    }
}
