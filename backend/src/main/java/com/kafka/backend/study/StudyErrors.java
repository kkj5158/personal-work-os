package com.kafka.backend.study;

import com.kafka.backend.shareddesk.storage.StorageFailure;
import java.util.*;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Order(-20)
@RestControllerAdvice(assignableTypes = StudyController.class)
class StudyErrors {
  @ExceptionHandler({
    org.springframework.dao.DataIntegrityViolationException.class,
    org.springframework.dao.OptimisticLockingFailureException.class
  })
  ResponseEntity<?> conflict() {
    return ResponseEntity.status(409)
        .header("Cache-Control", "private, no-store")
        .body(Map.of("code", "REVISION_CONFLICT", "message", "학습 데이터가 변경되었습니다. 새로고침 후 다시 시도하세요."));
  }

  @ExceptionHandler(StudyException.class)
  ResponseEntity<?> study(StudyException e) {
    return ResponseEntity.status(e.status)
        .header("Cache-Control", "private, no-store")
        .body(Map.of("code", e.code, "message", e.getMessage()));
  }

  @ExceptionHandler(StorageFailure.class)
  ResponseEntity<?> storage(StorageFailure e) {
    return ResponseEntity.status(422)
        .header("Cache-Control", "private, no-store")
        .body(Map.of("code", "STORAGE_FAILURE", "message", "파일 저장·검증을 완료하지 못했습니다."));
  }
}
