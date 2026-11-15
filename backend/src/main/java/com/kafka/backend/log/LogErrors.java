package com.kafka.backend.log;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = LogController.class)
@org.springframework.core.annotation.Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
class LogErrors {
  @ExceptionHandler(LogException.class)
  ResponseEntity<?> log(LogException e) {
    return ResponseEntity.status(e.status).body(Map.of("message", e.getMessage()));
  }

  @ExceptionHandler(com.kafka.backend.shareddesk.storage.StorageFailure.class)
  ResponseEntity<?> storage(com.kafka.backend.shareddesk.storage.StorageFailure e) {
    boolean unavailable =
        e.code() == com.kafka.backend.shareddesk.storage.StorageFailure.Code.DISABLED
            || e.code() == com.kafka.backend.shareddesk.storage.StorageFailure.Code.UNAVAILABLE;
    return ResponseEntity.status(unavailable ? 503 : 422)
        .body(
            Map.of(
                "message",
                unavailable ? "사진 저장소에 연결하지 못했습니다. 다시 시도해주세요." : "사진 형식·크기·무결성을 확인해주세요."));
  }
}
