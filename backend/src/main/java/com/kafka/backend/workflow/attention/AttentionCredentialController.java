package com.kafka.backend.workflow.attention;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/workflow/attention")
public class AttentionCredentialController {
    private final AttentionCredentials credentials;
    public AttentionCredentialController(AttentionCredentials credentials){this.credentials=credentials;}
    @PostMapping("/device-authorizations") public ResponseEntity<AttentionCredentials.Authorization> authorize(@RequestBody AttentionCredentials.Authorize in){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(credentials.authorize(in));}
    @PostMapping("/device-exchange") public ResponseEntity<AttentionCredentials.Credential> exchange(@RequestBody AttentionCredentials.Exchange in){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(credentials.exchange(in));}
    @PostMapping("/producer-credentials") public ResponseEntity<AttentionCredentials.Credential> producer(@RequestBody AttentionCredentials.Producer in){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(credentials.producer(in));}
    @GetMapping("/devices") public List<AttentionCredentials.Device> devices(){return credentials.devices();}
    @DeleteMapping("/devices/{id}") public ResponseEntity<Void> revoke(@PathVariable UUID id){credentials.revoke(id);return ResponseEntity.noContent().build();}
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<Map<String,String>> rejected(ResponseStatusException e){return ResponseEntity.status(e.getStatusCode()).cacheControl(CacheControl.noStore()).body(Map.of("code",e.getStatusCode().value()==429?"RATE_LIMIT":"AUTHORIZATION_REJECTED","message","연결 요청을 확인해 주세요."));}
    @ExceptionHandler(org.springframework.dao.DataAccessException.class) public ResponseEntity<Map<String,String>> unavailable(){return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).body(Map.of("code","TEMPORARILY_UNAVAILABLE","message","연결 서비스에 잠시 접근할 수 없습니다."));}
}
