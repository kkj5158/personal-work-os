package com.kafka.backend.diet;

import java.time.LocalDate;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import static com.kafka.backend.diet.DietTypes.*;

@RestController
@RequestMapping("/api/diet")
@ResponseStatus(HttpStatus.NO_CONTENT)
public class DietController {
    private final DietService service;
    public DietController(DietService service) { this.service=service; }
    @GetMapping @ResponseStatus(HttpStatus.OK) public Data data() { return service.data(); }
    @PutMapping("/days/{date}") public void day(@PathVariable LocalDate date,@RequestBody DailyRecord in) { service.day(date,in); }
    @PutMapping("/checks/{date}/{itemId}") public void check(@PathVariable LocalDate date,@PathVariable UUID itemId,@RequestBody DailyCheck in) { service.check(date,itemId,in); }
    @PutMapping("/items/{id}") public void item(@PathVariable UUID id,@RequestBody ChecklistItem in) { service.item(id,in); }
    @PutMapping("/challenges/{id}") public void challenge(@PathVariable UUID id,@RequestBody Challenge in) { service.challenge(id,in); }
    @PutMapping("/goals/{id}") public void goal(@PathVariable UUID id,@RequestBody WeightGoal in) { service.goal(id,in); }
    @PutMapping("/milestones/{id}") public void milestone(@PathVariable UUID id,@RequestBody Milestone in) { service.milestone(id,in); }
    @PutMapping("/items/order") public void itemOrder(@RequestBody OrderInput in) { service.order("items",in); }
    @PutMapping("/challenges/order") public void challengeOrder(@RequestBody OrderInput in) { service.order("challenges",in); }
    @DeleteMapping("/{entity}/{id}") public void delete(@PathVariable String entity,@PathVariable UUID id) { service.delete(entity,id); }
    @PutMapping("/settings") public void settings(@RequestBody Map<String,Object> in) { service.settings(in); }
}
