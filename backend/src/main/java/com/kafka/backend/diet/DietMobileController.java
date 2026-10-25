package com.kafka.backend.diet;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import java.time.LocalDate;
import java.util.*;
@RestController @RequestMapping("/api/diet/mobile")
public class DietMobileController {
    private final DietMobileService mobile; private final DietNoteSync sync;
    public DietMobileController(DietMobileService mobile,DietNoteSync sync){this.mobile=mobile;this.sync=sync;}
    @GetMapping("/calendar") public DietMobileService.Calendar calendar(@RequestParam LocalDate from,@RequestParam LocalDate to){return mobile.calendar(from,to);}
    @GetMapping("/journal") public DietMobileService.Page journal(@RequestParam(required=false) LocalDate before,@RequestParam(required=false) LocalDate until,@RequestParam(required=false) String month,@RequestParam(defaultValue="9") int limit){return mobile.journal(before,until,month,limit);}
    @GetMapping("/journal/{date}/media") public List<DietMobileService.JournalMedia> journalMedia(@PathVariable LocalDate date){return mobile.journalMedia(date);}
    @GetMapping("/plans") public List<DietMobileService.Plan> plans(){return mobile.plans();}
    @PutMapping("/plans/{id}") public DietMobileService.Plan save(@PathVariable UUID id,@RequestBody DietMobileService.PlanInput input){
        var before=sync.challengePeriod(id);var result=mobile.save(id,input);
        DietController.quietly(()->sync.projectPeriods(Arrays.asList(before,new LocalDate[]{result.value().startDate(),result.value().endDate()})));return result;
    }
    @DeleteMapping("/plans/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable UUID id,@RequestParam String expectedVersion){var before=sync.challengePeriod(id);mobile.delete(id,expectedVersion);if(before!=null)DietController.quietly(()->sync.projectPeriods(List.<LocalDate[]>of(before)));}
}
