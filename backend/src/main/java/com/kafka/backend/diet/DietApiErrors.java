package com.kafka.backend.diet;

import java.util.Map;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(0)
@RestControllerAdvice(assignableTypes=DietController.class)
public class DietApiErrors {
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String,String>> malformedPath(Exception ignored) {
        return ResponseEntity.badRequest().body(Map.of("message","날짜 또는 ID 형식을 확인하세요."));
    }
}
