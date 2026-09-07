package com.kafka.backend.notesystem;

import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import java.util.Map;

/** Note content and private media must not be echoed by validation/SQL errors. */
@Order(0)
@RestControllerAdvice(assignableTypes={NoteSystemController.class,NoteMediaController.class})
public class NoteApiErrors {
 @ExceptionHandler({MethodArgumentNotValidException.class,MethodArgumentTypeMismatchException.class})
 public ResponseEntity<Map<String,String>> invalid(Exception ignored){return ResponseEntity.badRequest().body(Map.of("message","입력 형식 또는 길이를 확인하세요."));}
 @ExceptionHandler(DataIntegrityViolationException.class)
 public ResponseEntity<Map<String,String>> conflict(DataIntegrityViolationException ignored){return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message","기존 제목, 별칭 또는 데이터와 충돌합니다."));}
}
