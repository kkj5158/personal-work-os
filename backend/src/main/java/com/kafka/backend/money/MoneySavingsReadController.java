package com.kafka.backend.money;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/money/bookkeeping/savings")
public class MoneySavingsReadController {
 private final MoneySavingsReadService service;
 public MoneySavingsReadController(MoneySavingsReadService service){this.service=service;}
 @GetMapping public Map<String,Object> read(@RequestParam String from,@RequestParam String to,@RequestParam(required=false) UUID destinationAccountId,@RequestParam(required=false) String search,@RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset){return service.read(from,to,destinationAccountId,search,limit,offset);}
}
