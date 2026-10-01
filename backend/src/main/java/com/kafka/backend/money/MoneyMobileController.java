package com.kafka.backend.money;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.*;

/** Owner-scoped Mobile surface. Uses the normal user JWT chain; Bridge device tokens cannot reach it. */
@RestController
@RequestMapping("/api/money/mobile")
public class MoneyMobileController {
    private final MoneyMobileService mobile;
    public MoneyMobileController(MoneyMobileService mobile){this.mobile=mobile;}
    @ExceptionHandler({java.time.DateTimeException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String,String>> invalid(){return ResponseEntity.badRequest().body(Map.of("message","유효한 날짜 / 식별자를 입력하세요."));}
    @ExceptionHandler(org.springframework.dao.DataAccessException.class)
    public ResponseEntity<Map<String,String>> storage(org.springframework.dao.DataAccessException e){
        return ResponseEntity.status(e instanceof org.springframework.dao.DataIntegrityViolationException?409:500).body(Map.of("message","저장하지 못했습니다. 새로고침 후 다시 확인하세요."));
    }
    @GetMapping("/funds") public MoneyMobileService.Funds funds(){return mobile.overview();}
    @PutMapping("/accounts/{id}/fund") public MoneyMobileService.FundAccount fund(@PathVariable UUID id,@RequestBody MoneyMobileService.FundInput input){return mobile.saveFund(id,input);}
    @PutMapping("/funds/order") public List<MoneyMobileService.FundAccount> order(@RequestBody MoneyMobileService.OrderInput input){return mobile.order(input);}
    @PostMapping("/accounts") @ResponseStatus(HttpStatus.CREATED) public MoneyMobileService.FundAccount create(@RequestBody MoneyMobileService.CreateInput input){return mobile.create(input);}
    @GetMapping("/accounts/{id}") public MoneyMobileService.FundAccount account(@PathVariable UUID id){return mobile.fundAccount(id);}
    @GetMapping("/settings") public MoneyMobileService.Settings settings(){return mobile.settings();}
    @PutMapping("/settings") public MoneyMobileService.Settings settings(@RequestBody MoneyMobileService.SettingsInput input){return mobile.saveSettings(input);}
    @GetMapping("/savings-trend") public MoneyMobileService.SavingsTrend savings(@RequestParam String from,@RequestParam String to,@RequestParam(defaultValue="month") String unit){return mobile.savingsTrend(from,to,unit);}
}
