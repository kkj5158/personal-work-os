package com.kafka.backend.calendar;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestHeader;
import java.util.UUID;

@RestController
@RequestMapping("/api/calendar/batch-actual")
public class BatchActualController {

    private final BatchActualService service;

    public BatchActualController(BatchActualService service) {
        this.service = service;
    }

    @PostMapping
    public BatchActualResponse commit(@RequestBody BatchActualRequest request,
            @RequestHeader(value="Idempotency-Key",required=false) UUID operationId) {
        return service.commit(request.date(), request.items(),operationId);
    }
}
