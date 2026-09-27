package com.kafka.backend.workflow;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

@RestController
@RequestMapping("/api/workflow")
public class WorkflowController {
    private final WorkflowService service;
    public WorkflowController(WorkflowService service){this.service=service;}
    @GetMapping public Aggregate all(){return service.all();}
    @PostMapping("/projects") public Project createProject(@RequestBody Project in){return service.saveProject(null,in);}
    @PutMapping("/projects/{id}") public Project updateProject(@PathVariable UUID id,@RequestBody Project in){return service.saveProject(id,in);}
    @DeleteMapping("/projects/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteProject(@PathVariable UUID id){service.deleteProject(id);}
    @PostMapping("/phases") public Phase createPhase(@RequestBody Phase in){return service.savePhase(null,in);}
    @PutMapping("/phases/{id}") public Phase updatePhase(@PathVariable UUID id,@RequestBody Phase in){return service.savePhase(id,in);}
    @DeleteMapping("/phases/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deletePhase(@PathVariable UUID id){service.deletePhase(id);}
    @PostMapping("/tasks") public Task createTask(@RequestBody Task in){return service.saveTask(null,in);}
    @PutMapping("/tasks/{id}") public Task updateTask(@PathVariable UUID id,@RequestBody Task in){return service.saveTask(id,in);}
    @DeleteMapping("/tasks/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void deleteTask(@PathVariable UUID id){service.deleteTask(id);}
    @GetMapping("/days") public List<LocalDate> recordedDates(@RequestParam(required=false) LocalDate before,@RequestParam(required=false) LocalDate after){if(before!=null&&after!=null)throw new com.kafka.backend.common.InvalidRequestException("Choose one date direction");return service.recordedDates(before,after);}
    @GetMapping("/fixed") public List<WorkflowService.FixedTab> fixedTabs(){return service.fixedTabs();}
    @GetMapping("/fixed/{id}") public WorkflowService.FixedTab fixedTab(@PathVariable UUID id){return service.fixedTab(id);}
    @PostMapping("/fixed") public WorkflowService.FixedTab createFixed(@RequestBody WorkflowService.FixedTab in){return service.saveFixedTab(null,in);}
    @PutMapping("/fixed/{id}") public WorkflowService.FixedTab saveFixed(@PathVariable UUID id,@RequestBody WorkflowService.FixedTab in){return service.saveFixedTab(id,in);}
    @GetMapping("/days/{date}") public Day day(@PathVariable LocalDate date){return service.day(date);}
    @PutMapping("/days/{date}") public Day saveDay(@PathVariable LocalDate date,@RequestBody DaySave in){return service.saveDay(date,in);}
    @PostMapping("/days/{date}/promote") public Task promote(@PathVariable LocalDate date,@RequestBody BlockAction in){return service.promote(date,in.blockId());}
    @PostMapping("/days/{date}/unlink") public Day unlink(@PathVariable LocalDate date,@RequestBody BlockAction in){return service.unlink(date,in.blockId());}
    @PostMapping("/days/{date}/carry") public Day carry(@PathVariable LocalDate date,@RequestBody Carry in){return service.carry(date,in);}
    @PostMapping("/days/{date}/move") public MoveResult move(@PathVariable LocalDate date,@RequestBody Move in){return service.move(date,in);}
    @PostMapping("/moves/{token}/undo") public MoveResult undoMove(@PathVariable UUID token){return service.undoMove(token);}
    @PostMapping("/tasks/{id}/today") public TaskReferenceResult today(@PathVariable UUID id,@RequestBody AddToday in){return service.addToday(id,in.date());}
    @PostMapping("/tasks/{id}/continue") public TaskReferenceResult continueTask(@PathVariable UUID id,@RequestBody AddToday in){return service.continueTask(id,in.date());}
    @PatchMapping("/projects/{id}") public Project patchProject(@PathVariable UUID id,@RequestBody Map<String,Object> in){return service.patchProject(id,in);}
    @PatchMapping("/phases/{id}") public Phase patchPhase(@PathVariable UUID id,@RequestBody Map<String,Object> in){return service.patchPhase(id,in);}
    @PatchMapping("/tasks/{id}") public Task patchTask(@PathVariable UUID id,@RequestBody Map<String,Object> in){return service.patchTask(id,in);}
    @PostMapping("/tasks/{id}/status") public Task status(@PathVariable UUID id,@RequestBody StatusChange in){return service.changeStatus(id,in);}
    @PostMapping("/tasks/{id}/archive") public Task archiveTask(@PathVariable UUID id,@RequestBody ArchiveChange in){return service.archiveTask(id,in);}
    @PostMapping("/projects/{id}/archive") public Project archiveProject(@PathVariable UUID id,@RequestBody ArchiveChange in){return service.archiveProject(id,in);}
    @PostMapping("/tasks/{id}/duplicate") public Task duplicate(@PathVariable UUID id){return service.duplicateTask(id);}
    @GetMapping("/tasks/{id}/events") public List<WorkflowService.TaskEvent> events(@PathVariable UUID id){return service.events(id);}
    @GetMapping("/preferences") public Map<String,Object> preferences(){return service.preferences();}
    @PutMapping("/preferences") public Map<String,Object> preferences(@RequestBody Map<String,Object> in){return service.preferences(in);}
}
