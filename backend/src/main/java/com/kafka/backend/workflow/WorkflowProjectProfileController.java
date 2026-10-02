package com.kafka.backend.workflow;

import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/workflow/project-profiles")
public class WorkflowProjectProfileController {
    private final WorkflowProjectProfileService service;
    public WorkflowProjectProfileController(WorkflowProjectProfileService service){this.service=service;}
    @GetMapping public List<Map<String,Object>> profiles(){return service.profiles();}
}
