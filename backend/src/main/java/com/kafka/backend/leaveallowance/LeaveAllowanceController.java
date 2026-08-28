package com.kafka.backend.leaveallowance;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.YearMonth;

@RestController
@RequestMapping("/api/leave-allowances")
public class LeaveAllowanceController {

    private final LeaveAllowanceService service;

    public LeaveAllowanceController(LeaveAllowanceService service) {
        this.service = service;
    }

    @GetMapping("/{year}/{month}")
    public LeaveMonthSummary getSummary(@PathVariable int year, @PathVariable int month) {
        return service.getSummary(YearMonth.of(year, month));
    }

    @PutMapping("/{year}/{month}")
    public LeaveMonthSummary configure(@PathVariable int year, @PathVariable int month, @RequestBody LeaveAllowanceRequest request) {
        service.configure(year, month, request.allowanceDays());
        return service.getSummary(YearMonth.of(year, month));
    }
}
