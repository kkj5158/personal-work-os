package com.kafka.backend.workflow;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Projects catalog grouping and ordering. Group order itself uses PUT /api/workflow/order with scope "project-groups". */
@RestController
@RequestMapping("/api/workflow")
public class WorkflowProjectGroupController {
    private final WorkflowProjectGroupService groups;
    public WorkflowProjectGroupController(WorkflowProjectGroupService groups) { this.groups = groups; }
    @GetMapping("/project-groups") public List<ProjectGroup> list() { return groups.groups(); }
    @PostMapping("/project-groups") @ResponseStatus(HttpStatus.CREATED) public ProjectGroup create(@RequestBody GroupInput in) { return groups.create(in); }
    @PatchMapping("/project-groups/{id}") public ProjectGroup rename(@PathVariable UUID id, @RequestBody GroupInput in) { return groups.rename(id, in); }
    /** Returns the Projects catalog after the group's Projects moved to 그룹 없음. */
    @DeleteMapping("/project-groups/{id}") public List<Project> delete(@PathVariable UUID id) { return groups.delete(id); }
    @PostMapping("/projects/{id}/move") public List<Project> move(@PathVariable UUID id, @RequestBody ProjectMove in) { return groups.move(id, in); }
}
