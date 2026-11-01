package com.kafka.backend.orbit;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Read-only natural-language tool boundary. The underlying domain services
 * remain the source of truth for ownership, money, planning, and records.
 */
@RestController
@RequestMapping("/api/orbit/context")
public class OrbitReadController {
    private final OrbitReadService service;

    public OrbitReadController(OrbitReadService service) {
        this.service = service;
    }

    @GetMapping("/get_diet_daily_context")
    public Map<String, Object> dietDaily(@RequestParam(required = false) String from,
                                         @RequestParam(required = false) String to) {
        return service.dietDaily(from, to);
    }

    @GetMapping("/get_diet_progress_context")
    public Map<String, Object> dietProgress(@RequestParam(required = false) String from,
                                            @RequestParam(required = false) String to) {
        return service.dietProgress(from, to);
    }

    @GetMapping("/get_calendar_context")
    public Map<String, Object> calendar(@RequestParam(required = false) String from,
                                         @RequestParam(required = false) String to) {
        return service.calendar(from, to);
    }

    @GetMapping("/get_work_records_context")
    public Map<String, Object> workRecords(@RequestParam(required = false) String from,
                                            @RequestParam(required = false) String to) {
        return service.workRecords(from, to);
    }

    @GetMapping("/get_checklist_catalog_context")
    public Map<String, Object> checklistCatalog() {
        return service.checklistCatalog();
    }

    @GetMapping("/get_checklist_records_context")
    public Map<String, Object> checklistRecords(@RequestParam(required = false) String from,
                                                @RequestParam(required = false) String to) {
        return service.checklistRecords(from, to);
    }

    @GetMapping("/get_workflow_projects_context")
    public Map<String, Object> workflowProjects(@RequestParam(required = false) String status,
                                                @RequestParam(defaultValue = "50") int limit,
                                                @RequestParam(defaultValue = "0") int offset) {
        return service.workflowProjects(status, limit, offset);
    }

    @GetMapping("/get_workflow_tasks_context")
    public Map<String, Object> workflowTasks(@RequestParam(required = false) String status,
                                             @RequestParam(defaultValue = "50") int limit,
                                             @RequestParam(defaultValue = "0") int offset) {
        return service.workflowTasks(status, limit, offset);
    }

    @GetMapping("/get_workflow_day_context")
    public Map<String, Object> workflowDay(@RequestParam(required = false) String date) {
        return service.workflowDay(date);
    }

    @GetMapping("/get_workflow_plan_context")
    public Map<String, Object> workflowPlan(@RequestParam(required = false) String from,
                                            @RequestParam(required = false) String to) {
        return service.workflowPlan(from, to);
    }

    @GetMapping("/get_workflow_waiting_context")
    public Map<String, Object> workflowWaiting() {
        return service.workflowWaiting();
    }

    @GetMapping("/get_money_overview_context")
    public Map<String, Object> moneyOverview(@RequestParam(required = false) String from,
                                              @RequestParam(required = false) String to) {
        return service.moneyOverview(from, to);
    }

    @GetMapping("/get_money_transactions_context")
    public Map<String, Object> moneyTransactions(@RequestParam(required = false) String from,
                                                  @RequestParam(required = false) String to,
                                                  @RequestParam(defaultValue = "50") int limit,
                                                  @RequestParam(defaultValue = "0") int offset) {
        return service.moneyTransactions(from, to, limit, offset);
    }

    @GetMapping("/get_money_accounts_context")
    public Map<String, Object> moneyAccounts() {
        return service.moneyAccounts();
    }

    @GetMapping("/get_money_loans_context")
    public Map<String, Object> moneyLoans() {
        return service.moneyLoans();
    }

    @GetMapping("/get_money_savings_context")
    public Map<String, Object> moneySavings(@RequestParam(required = false) String from,
                                            @RequestParam(required = false) String to,
                                            @RequestParam(defaultValue = "50") int limit,
                                            @RequestParam(defaultValue = "0") int offset,
                                            @RequestParam(required = false) String currency) {
        return service.moneySavings(from, to, limit, offset, currency);
    }

    @GetMapping("/get_money_earnings_context")
    public Map<String, Object> moneyEarnings(@RequestParam(required = false) String month) {
        return service.moneyEarnings(month);
    }
}
