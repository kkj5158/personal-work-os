package com.kafka.backend.money;

import org.springframework.web.bind.annotation.*;
import java.util.*;

/** Fixed owner-scoped application/MCP routes; delegated OAuth proof is enforced upstream. */
@RestController
@RequestMapping("/api/orbit/money/v1/recon")
public class MoneyStatementReconciliationController {
 private final MoneyStatementReconciliationService service;private final MoneyOrbitConsoleService console;
 public MoneyStatementReconciliationController(MoneyStatementReconciliationService service,MoneyOrbitConsoleService console){this.service=service;this.console=console;}
 @ModelAttribute public void noStore(jakarta.servlet.http.HttpServletResponse response){response.setHeader("Cache-Control","no-store");response.setHeader("Pragma","no-cache");}
 private Object result(Object v){return console.envelope(v);}
 @GetMapping("/capabilities") public Object capabilities(){return result(service.capabilities());}
 @PostMapping("/intake-start") public Object intake(@RequestBody MoneyStatementReconciliationService.Intake v){return result(service.intake(v));}
 @PostMapping("/intake-chunk") public Object chunk(@RequestBody MoneyStatementReconciliationService.Chunk v){return result(service.chunk(v));}
 @PostMapping("/import-preview") public Object complete(@RequestBody MoneyStatementReconciliationService.Complete v){return result(service.complete(v));}
 @GetMapping("/statements") public Object statements(@RequestParam(required=false) UUID accountId,@RequestParam(defaultValue="25") int limit,@RequestParam(defaultValue="0") int offset){return result(service.statements(accountId,limit,offset));}
 @GetMapping("/statement") public Object statement(@RequestParam UUID id){return result(service.statement(id));}
 @GetMapping("/rows") public Object rows(@RequestParam UUID id,@RequestParam(defaultValue="25") int limit,@RequestParam(defaultValue="0") int offset){return result(service.rows(id,limit,offset));}
 @PostMapping("/analyze") public Object analyze(@RequestBody MoneyStatementReconciliationService.Analyze v){return result(service.analyze(v));}
 @GetMapping("/status") public Object status(@RequestParam UUID id,@RequestParam(defaultValue="25") int limit,@RequestParam(defaultValue="0") int offset){return result(service.status(id,limit,offset));}
 @GetMapping("/candidate") public Object candidate(@RequestParam UUID id){return result(service.details(id));}
 @GetMapping("/observation") public Object observation(@RequestParam UUID id){return result(service.observation(id));}
 @PostMapping("/batch-preview") public Object preview(@RequestBody MoneyStatementReconciliationService.Preview v){return result(service.preview(v));}
 @PostMapping("/batch-execute") public Object execute(@RequestBody MoneyStatementReconciliationService.Execute v){return result(service.execute(v));}
 @GetMapping("/history") public Object history(@RequestParam(defaultValue="25") int limit,@RequestParam(defaultValue="0") int offset){return result(service.history(limit,offset));}
}
