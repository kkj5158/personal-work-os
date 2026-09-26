package com.kafka.backend.diet;

import java.time.LocalDate;
import java.util.*;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import static com.kafka.backend.diet.DietTypes.*;

@RestController
@RequestMapping("/api/diet")
@ResponseStatus(HttpStatus.NO_CONTENT)
public class DietController {
    private static final Logger log=LoggerFactory.getLogger(DietController.class);
    private final DietService service;
    private final ObjectProvider<DietNoteSync> sync;
    public DietController(DietService service,ObjectProvider<DietNoteSync> sync) { this.service=service;this.sync=sync; }
    /**
     * NOTE SYS projection runs after the DIET transaction has committed, in its own
     * transaction. A projection failure is logged and never fails the canonical DIET write.
     */
    static void quietly(Supplier<Integer> projection) {
        try { projection.get(); } catch(RuntimeException e) { log.warn("DIET -> NOTE SYS projection skipped: {}",e.getMessage()); }
    }
    private void project(Collection<LocalDate> dates) { var s=sync.getIfAvailable(); if(s!=null)quietly(()->s.project(dates)); }
    private void resync() { var s=sync.getIfAvailable(); if(s!=null)quietly(s::resyncAll); }
    @GetMapping @ResponseStatus(HttpStatus.OK) public Data data() { return service.data(); }
    @PutMapping("/days/{date}") public void day(@PathVariable LocalDate date,@RequestBody DailyRecord in) { service.day(date,in);project(List.of(date)); }
    @PutMapping("/checks") public void checks(@RequestBody CheckChanges in) {
        service.checks(in);
        project(in.changes().stream().map(CheckChange::date).distinct().toList());
    }
    @PostMapping("/items/{id}/restore") public void restore(@PathVariable UUID id) { service.restore(id);resync(); }
    @PutMapping("/checks/{date}/{itemId}") public void check(@PathVariable LocalDate date,@PathVariable UUID itemId,@RequestBody DailyCheck in) { service.check(date,itemId,in);project(List.of(date)); }
    @PutMapping("/items/{id}") public void item(@PathVariable UUID id,@RequestBody ChecklistItem in) { service.item(id,in);resync(); }
    @PutMapping("/challenges/{id}") public void challenge(@PathVariable UUID id,@RequestBody Challenge in) {
        var s=sync.getIfAvailable();var before=s==null?null:s.challengePeriod(id);
        service.challenge(id,in);
        if(s!=null)quietly(()->s.projectPeriods(Arrays.asList(before,new LocalDate[]{in.startDate(),in.endDate()})));
    }
    @PutMapping("/goals/{id}") public void goal(@PathVariable UUID id,@RequestBody WeightGoal in) { service.goal(id,in); }
    @PutMapping("/milestones/{id}") public void milestone(@PathVariable UUID id,@RequestBody Milestone in) { service.milestone(id,in); }
    @PutMapping("/items/order") public void itemOrder(@RequestBody OrderInput in) { service.order("items",in); }
    @PutMapping("/challenges/order") public void challengeOrder(@RequestBody OrderInput in) { service.order("challenges",in); }
    @PutMapping("/challenges/home-order") public void homeOrder(@RequestBody HomeOrderInput in) { service.homeOrder(in); }
    @DeleteMapping("/{entity}/{id}") public void delete(@PathVariable String entity,@PathVariable UUID id) {
        var s=sync.getIfAvailable();var before=s!=null&&entity.equals("challenges")?s.challengePeriod(id):null;
        service.delete(entity,id);
        if(before!=null)quietly(()->s.projectPeriods(List.<LocalDate[]>of(before)));
        else if(entity.equals("items"))resync();
    }
    @PutMapping("/settings") public void settings(@RequestBody Map<String,Object> in) { service.settings(in); }
}
