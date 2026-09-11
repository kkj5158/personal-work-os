package com.kafka.backend.calendar;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController
@RequestMapping("/api/calendar/actual")
public class CalendarActualEditorController {
    private final CalendarActualEditorService service;
    public CalendarActualEditorController(CalendarActualEditorService service){this.service=service;}
    @GetMapping("/{sourceType}/{id}")
    public CalendarActualEditorDto get(@PathVariable ActualSourceType sourceType,@PathVariable UUID id){return service.get(sourceType,id);}
    @PostMapping("/{sourceType}")
    public CalendarActualEditorDto create(@PathVariable ActualSourceType sourceType,@RequestBody CalendarActualEditRequest request){return service.save(sourceType,null,request);}
    @PutMapping("/{sourceType}/{id}")
    public CalendarActualEditorDto update(@PathVariable ActualSourceType sourceType,@PathVariable UUID id,@RequestBody CalendarActualEditRequest request){return service.save(sourceType,id,request);}
    @DeleteMapping("/{sourceType}/{id}")
    public CalendarActualEditorService.DeleteResult delete(@PathVariable ActualSourceType sourceType,@PathVariable UUID id){return service.delete(sourceType,id);}
    @PostMapping("/undo/{token}")
    public CalendarActualEditorDto restore(@PathVariable UUID token){return service.restore(token);}
}
