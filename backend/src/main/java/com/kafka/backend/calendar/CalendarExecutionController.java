package com.kafka.backend.calendar;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/calendar/executions")
public class CalendarExecutionController {
    private final CalendarExecutionService service;
    public CalendarExecutionController(CalendarExecutionService service){this.service=service;}
    @GetMapping public List<CalendarExecutionService.Execution> list(){return service.list();}
    @PostMapping("/{planId}/start") public CalendarExecutionService.Execution start(@PathVariable UUID planId,@RequestBody(required=false) CalendarExecutionService.Start request){return service.start(planId,request);}
    @PostMapping("/{planId}/finish") public CalendarExecutionService.Execution finish(@PathVariable UUID planId){return service.finish(planId);}
    @PostMapping("/{planId}/history") public CalendarExecutionService.Execution history(@PathVariable UUID planId,@RequestBody CalendarExecutionService.History request){return service.history(planId,request);}
    @DeleteMapping("/{planId}") public void cancel(@PathVariable UUID planId){service.cancel(planId);}
}
