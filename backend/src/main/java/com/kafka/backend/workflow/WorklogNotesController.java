package com.kafka.backend.workflow;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.kafka.backend.workflow.WorklogNotesService.*;
@RestController
@RequestMapping("/api/workflow/notes")
public class WorklogNotesController {
    private final WorklogNotesService service;
    public WorklogNotesController(WorklogNotesService service){this.service=service;}
    @GetMapping public List<Topic> search(@RequestParam(defaultValue="") String q){return service.search(q);}
    @GetMapping("/{id}") public Topic get(@PathVariable UUID id){return service.get(id);}
    @PostMapping public Topic create(@RequestBody TopicInput in){return service.create(in);}
    @PostMapping("/resolve") public List<Topic> resolve(@RequestBody TopicInput in){return service.resolve(in.title());}
    @PutMapping("/{id}") public Topic save(@PathVariable UUID id,@RequestBody TopicInput in){return service.save(id,in);}
    @GetMapping("/{id}/backlinks") public List<Backlink> backlinks(@PathVariable UUID id){return service.backlinks(id);}
}
