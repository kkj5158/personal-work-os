package com.kafka.backend.shareddesk;
import java.util.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@Order(-10)
@RestControllerAdvice(assignableTypes=DeskController.class)
public class DeskErrors {
 @ExceptionHandler(DeskException.class) public ResponseEntity<Map<String,Object>> handle(DeskException e){
  var body=new LinkedHashMap<String,Object>();body.put("code",e.code);body.put("message",e.getMessage());body.putAll(e.details);
  var response=ResponseEntity.status(e.status).header("Cache-Control","no-store");if(e.status==429)response.header("Retry-After","60");return response.body(body);
 }
}
