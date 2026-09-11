package com.kafka.backend.calendar;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/calendar/batch-actual")
public class BatchActualController {

    private final BatchActualService service;

    public BatchActualController(BatchActualService service) {
        this.service = service;
    }

    @PostMapping
    public BatchActualResponse commit(@RequestBody BatchActualRequest request) {
        return service.commit(request.date(), request.items());
    }
}
