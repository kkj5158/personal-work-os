package com.kafka.backend.workflow;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Planning, projection and linked-resource routes. All read and write the canonical Task by id. */
@RestController
@RequestMapping("/api/workflow")
public class WorkflowPlanningController {
    private final WorkflowPlanningService planning;
    private final WorkflowProjectionService projections;
    private final WorkflowResourceService resources;
    public WorkflowPlanningController(WorkflowPlanningService planning, WorkflowProjectionService projections, WorkflowResourceService resources) {
        this.planning = planning; this.projections = projections; this.resources = resources;
    }
    @GetMapping("/tasks/{id}/plan-days") public List<PlanDay> planDays(@PathVariable UUID id) { return planning.planDays(id); }
    @PutMapping("/tasks/{id}/plan-days/{date}") public List<PlanDay> addPlanDay(@PathVariable UUID id, @PathVariable LocalDate date) { return planning.addPlanDay(id, date); }
    @DeleteMapping("/tasks/{id}/plan-days/{date}") public List<PlanDay> removePlanDay(@PathVariable UUID id, @PathVariable LocalDate date) { return planning.removePlanDay(id, date); }
    @PostMapping("/plan-days/move") public WorkflowPlanningService.PlanDayMoveResult move(@RequestBody WorkflowPlanningService.PlanDayMove in) { return planning.movePlanDay(in); }
    @GetMapping("/plan") public List<WorkflowProjectionService.PlannedTask> plan(@RequestParam LocalDate from, @RequestParam LocalDate to) { return projections.plan(from, to); }

    @GetMapping("/weeks/{week}") public WorkflowPlanningService.Week week(@PathVariable LocalDate week) { return planning.week(week); }
    @PutMapping("/weeks/{week}/projects/{projectId}") public WorkflowPlanningService.Week include(@PathVariable LocalDate week, @PathVariable UUID projectId, @RequestBody(required = false) WorkflowPlanningService.ProjectInclusion in) { return planning.includeProject(week, projectId, in); }
    @DeleteMapping("/weeks/{week}/projects/{projectId}") public WorkflowPlanningService.Week exclude(@PathVariable LocalDate week, @PathVariable UUID projectId) { return planning.excludeProject(week, projectId); }
    @PutMapping("/weeks/{week}/tasks/{taskId}") public WorkflowPlanningService.Week select(@PathVariable LocalDate week, @PathVariable UUID taskId) { return planning.selectTask(week, taskId); }
    @DeleteMapping("/weeks/{week}/tasks/{taskId}") public WorkflowPlanningService.Week unselect(@PathVariable LocalDate week, @PathVariable UUID taskId) { return planning.unselectTask(week, taskId); }
    @PutMapping("/weeks/{week}/content") public WorkflowPlanningService.Week content(@PathVariable LocalDate week, @RequestBody WorkflowPlanningService.WeekContent in) { return planning.saveContent(week, in); }
    @PutMapping("/order") public List<UUID> order(@RequestBody WorkflowPlanningService.Reorder in) { return planning.reorder(in); }

    @GetMapping("/projects/{id}/recent-records") public List<WorkflowProjectionService.RecentRecord> projectRecords(@PathVariable UUID id, @RequestParam(defaultValue = "10") int limit) { return projections.recentForProject(id, limit); }
    @GetMapping("/tasks/{id}/recent-records") public List<WorkflowProjectionService.RecentRecord> taskRecords(@PathVariable UUID id, @RequestParam(defaultValue = "10") int limit) { return projections.recentForTask(id, limit); }
    @GetMapping("/waiting") public WorkflowProjectionService.Waiting waiting(@RequestParam(required = false) LocalDate today) { return projections.waiting(today); }

    @GetMapping("/resources") public List<WorkflowResourceService.Resource> resources(@RequestParam(required = false) UUID projectId, @RequestParam(required = false) UUID taskId) { return resources.list(projectId, taskId); }
    @PostMapping("/resources") public WorkflowResourceService.Resource createResource(@RequestBody WorkflowResourceService.ResourceInput in) { return resources.create(in); }
    @PatchMapping("/resources/{id}") public WorkflowResourceService.Resource patchResource(@PathVariable UUID id, @RequestBody WorkflowResourceService.ResourcePatch in) { return resources.patch(id, in); }
    @DeleteMapping("/resources/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteResource(@PathVariable UUID id) { resources.delete(id); }
}
