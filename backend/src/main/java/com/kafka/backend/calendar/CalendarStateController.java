package com.kafka.backend.calendar;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/calendar/state")
public class CalendarStateController {
    private final CalendarStateService service;
    public CalendarStateController(CalendarStateService service) {this.service=service;}
    @PostMapping public CalendarClipboardService.Ref change(@RequestBody CalendarStateService.Change request) {return service.change(request);}
}
