package com.kafka.backend.calendar;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api/calendar/clipboard")
public class CalendarClipboardController {
    private final CalendarClipboardService service;
    public CalendarClipboardController(CalendarClipboardService service){this.service=service;}
    @PostMapping("/snapshot") public List<CalendarClipboardService.Item> snapshot(@RequestBody List<CalendarClipboardService.Ref> items){return service.snapshot(items);}
    @PostMapping("/paste") public CalendarClipboardService.PasteResult paste(@RequestBody CalendarClipboardService.Paste request){return service.paste(request);}
    @PostMapping("/delete") public CalendarClipboardService.DeleteResult delete(@RequestBody List<CalendarClipboardService.Ref> items){return service.delete(items);}
    @PostMapping("/undo/{token}") public List<CalendarClipboardService.Ref> restore(@PathVariable UUID token){return service.restore(token);}
}
