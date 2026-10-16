package com.kafka.backend.diet;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
@RestController @RequestMapping("/api/diet/measurements")
public class DietMeasurementController {
 private final DietMeasurementService service; private final ObjectProvider<DietNoteSync> sync;
 public DietMeasurementController(DietMeasurementService service,ObjectProvider<DietNoteSync> sync){this.service=service;this.sync=sync;}
 @GetMapping public DietMeasurementService.Page list(@RequestParam(required=false) String before,@RequestParam(defaultValue="500") int limit){return service.list(before,limit);}
 @PutMapping("/{id}") public DietMeasurementService.Measurement save(@PathVariable UUID id,@RequestBody DietMeasurementService.Input input){
  var oldDate=service.dateOf(id);var saved=service.save(id,input);
  var dates=new java.util.HashSet<java.time.LocalDate>();if(oldDate!=null)dates.add(oldDate);dates.add(saved.date());
  var projection=sync.getIfAvailable();if(projection!=null)DietController.quietly(()->projection.project(dates));return saved;
 }
}
