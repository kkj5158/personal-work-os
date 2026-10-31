package com.kafka.backend.morning;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import java.util.Map;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = MorningVoiceController.class)
public class MorningVoiceAdvice {
    @ExceptionHandler(MorningVoiceException.class)
    ResponseEntity<Map<String,String>> voice(MorningVoiceException e) { return error(e.status(),e.code()); }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<Map<String,String>> invalid(Exception e) { return error(400,"INVALID_REQUEST"); }
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String,String>> unexpected(Exception e) { return error(503,"GATEWAY_UNAVAILABLE"); }
    private ResponseEntity<Map<String,String>> error(int status, String code) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(Map.of("code",code,"message",code));
    }
}
