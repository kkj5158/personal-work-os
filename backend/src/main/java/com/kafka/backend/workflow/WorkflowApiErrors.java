package com.kafka.backend.workflow;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import java.util.Map;

@RestControllerAdvice(assignableTypes={WorkflowController.class,WorkflowMediaController.class})
@Order(Ordered.HIGHEST_PRECEDENCE)
public class WorkflowApiErrors {
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String,String>> malformed() {return ResponseEntity.badRequest().body(Map.of("message","Invalid date or identifier"));}
}
