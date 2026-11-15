package com.kafka.backend.orbit;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Read-only ORBIT projection over canonical DIET measurements. */
@RestController
@RequestMapping("/api/orbit/context")
public class DietContextController {
    private final DietContextService service;

    public DietContextController(DietContextService service) {
        this.service = service;
    }

    @GetMapping("/get_diet_context")
    public Map<String, Object> context(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return service.context(from, to);
    }
}
