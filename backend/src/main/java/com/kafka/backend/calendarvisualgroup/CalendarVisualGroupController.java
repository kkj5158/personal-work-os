package com.kafka.backend.calendarvisualgroup;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/api/calendar/visual-groups")
public class CalendarVisualGroupController {
    private final CalendarVisualGroupService service;
    public CalendarVisualGroupController(CalendarVisualGroupService service){this.service=service;}
    @GetMapping public List<VisualGroupResponse> list(@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,@RequestParam @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to){return service.list(from,to);}
    @GetMapping("/{id}") public VisualGroupResponse get(@PathVariable UUID id){return service.get(id);}
    @PostMapping public ResponseEntity<VisualGroupResponse> create(@RequestBody VisualGroupRequest request){return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));}
    @PutMapping("/{id}") public VisualGroupResponse update(@PathVariable UUID id,@RequestBody VisualGroupRequest request){return service.update(id,request);}
    @DeleteMapping("/{id}") public CalendarVisualGroupService.DeleteResult delete(@PathVariable UUID id){return service.delete(id);}
    @PostMapping("/undo/{token}") public VisualGroupResponse restore(@PathVariable UUID token){return service.restore(token);}
}
