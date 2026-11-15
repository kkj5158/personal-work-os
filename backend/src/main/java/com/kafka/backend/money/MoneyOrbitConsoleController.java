package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import jakarta.servlet.http.HttpServletResponse;
import java.util.*;
import tools.jackson.databind.ObjectMapper;
import com.kafka.backend.common.InvalidRequestException;

/** Typed versioned ORBIT application surface, with no arbitrary route/patch/query execution. */
@RestController
@RequestMapping("/api/orbit/money/v1")
public class MoneyOrbitConsoleController {
 private final MoneyOrbitConsoleService service;private final ObjectMapper json;
 public MoneyOrbitConsoleController(MoneyOrbitConsoleService service,ObjectMapper json){this.service=service;this.json=json;}
 @ModelAttribute public void noStore(HttpServletResponse response){response.setHeader("Cache-Control","no-store");response.setHeader("Pragma","no-cache");}
 @GetMapping("/{operation}") public Object read(@PathVariable String operation,@ModelAttribute MoneyOrbitConsoleService.Query query){return service.envelope(service.read(operation,query));}
 @PostMapping("/category-color") public Object color(@RequestBody MoneyOrbitConsoleService.ColorCommand v){return service.envelope(service.write("category-color",v));}
 @PostMapping("/create-category") public Object create(@RequestBody MoneyOrbitConsoleService.CategoryCreate v){return service.envelope(service.write("create-category",v));}
 @PostMapping("/category-metadata") public Object metadata(@RequestBody MoneyOrbitConsoleService.CategoryMetadata v){return service.envelope(service.write("category-metadata",v));}
 @PostMapping("/category-order") public Object order(@RequestBody MoneyOrbitConsoleService.CategoryOrder v){return service.envelope(service.write("category-order",v));}
 @PostMapping({"/bookkeeping-category","/bulk-classify"}) public Object classify(jakarta.servlet.http.HttpServletRequest req,@RequestBody MoneyOrbitConsoleService.Classify v){return service.envelope(service.write(req.getServletPath().endsWith("bulk-classify")?"bulk-classify":"bookkeeping-category",v));}
 @PostMapping("/bookkeeping-meaning") public Object meaning(@RequestBody MoneyOrbitConsoleService.Meaning v){return service.envelope(service.write("bookkeeping-meaning",v));}
 @PostMapping("/preview/category-color-plan") public Object colors(@RequestBody MoneyOrbitConsoleService.ColorPlan v){return service.envelope(service.preview("category-color-plan",v));}
 @PostMapping("/preview/classification-batch") public Object classification(@RequestBody MoneyOrbitConsoleService.Classify v){return service.envelope(service.preview("classification-batch",v));}
 @PostMapping("/preview/rule-change") public Object rule(@RequestBody MoneyOrbitConsoleService.RuleChange v){return service.envelope(service.preview("rule-change",v));}
 @PostMapping("/preview/rule-history") public Object history(@RequestBody MoneyMeaningService.HistoryRequest v){return service.envelope(service.preview("rule-history",v));}
 @PostMapping("/preview/category-structure") public Object structure(@RequestBody MoneyOrbitConsoleService.Structure v){return service.envelope(service.preview("category-structure",v));}
 @PostMapping("/preview/financial-correction") public Object financial(@RequestBody MoneyOrbitConsoleService.Financial v){return service.envelope(service.preview("financial-correction",v));}
 @PostMapping("/preview/account-settings") public Object account(@RequestBody MoneyOrbitConsoleService.AccountSettings v){return service.envelope(service.preview("account-settings",v));}
 @PostMapping("/preview/undo-classification") public Object undo(@RequestBody MoneyOrbitConsoleService.UndoPlan v){return service.envelope(service.preview("undo-classification",v));}
 @PostMapping("/preview/review-batch") public Object review(@RequestBody MoneyOrbitConsoleService.ReviewPlan v){return service.envelope(service.preview("review-batch",v));}
 @PostMapping("/execute/{operation}") public Object execute(@PathVariable String operation,@RequestBody MoneyOrbitConsoleService.Execute v){return service.envelope(service.execute(operation,v));}
 @ExceptionHandler({IllegalArgumentException.class,java.time.DateTimeException.class}) public ResponseEntity<?> invalid(){return ResponseEntity.badRequest().body(Map.of("error","VALIDATION","message","유효한 식별자·기간·명령을 입력하세요."));}
}
