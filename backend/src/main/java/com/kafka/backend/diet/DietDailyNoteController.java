package com.kafka.backend.diet;

import java.time.LocalDate;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import static com.kafka.backend.diet.DietDailyNoteService.*;
import static com.kafka.backend.diet.DietNoteSync.*;

/** Date-keyed Diet Daily Note and the NOTE SYS projection preference (V57). */
@RestController
@RequestMapping("/api/diet")
public class DietDailyNoteController {
    private final DietDailyNoteService notes;
    private final DietNoteSync sync;
    public DietDailyNoteController(DietDailyNoteService notes,DietNoteSync sync){this.notes=notes;this.sync=sync;}
    @GetMapping("/notes") public List<DailyNote> range(@RequestParam LocalDate from,@RequestParam LocalDate to){return notes.range(from,to);}
    @GetMapping("/notes/latest") public List<DailyNote> latest(@RequestParam(defaultValue="1") int limit){return notes.latest(limit);}
    @GetMapping("/notes/{date}") public DailyNote get(@PathVariable LocalDate date){return notes.get(date);}
    @PutMapping("/notes/{date}") public DailyNote save(@PathVariable LocalDate date,@RequestBody NoteInput in){
        var saved=notes.save(date,in);
        DietController.quietly(()->sync.project(List.of(date)));
        return saved;
    }
    @GetMapping("/note-sync") public SyncSettings syncSettings(){return sync.settings();}
    @PutMapping("/note-sync") public SyncResult updateSync(@RequestBody SyncInput in){return sync.update(in);}
}
