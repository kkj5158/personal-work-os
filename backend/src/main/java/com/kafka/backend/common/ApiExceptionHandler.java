package com.kafka.backend.common;

import com.kafka.backend.worksettings.WorkSettingsNotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.http.converter.HttpMessageNotReadableException;

import java.util.Map;

/**
 * Every response body here is a fixed, generic {@code {"message": ...}}
 * shape with no exception-derived detail beyond the deliberately
 * hand-written messages our own service code throws — never a raw
 * exception message, stack trace, SQL, constraint name, or connection
 * detail. The frontend can reliably distinguish each case by HTTP status:
 * 400 validation, 404 not-found/ownership (deliberately indistinguishable
 * from each other), 409 version conflict or a data conflict outside our own
 * explicit version check, 415/400 malformed request, 500 anything else.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", ex.getMessage()));
    }

    @ExceptionHandler(WorkSettingsNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleWorkSettingsNotFound(WorkSettingsNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", ex.getMessage()));
    }

    @ExceptionHandler(InvalidRequestException.class)
    public ResponseEntity<Map<String, String>> handleInvalidRequest(InvalidRequestException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", ex.getMessage()));
    }

    @ExceptionHandler(OptimisticLockConflictException.class)
    public ResponseEntity<Map<String, String>> handleOptimisticLockConflict(OptimisticLockConflictException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", ex.getMessage()));
    }

    /**
     * A real JPA/Hibernate optimistic-lock failure at flush time (as opposed
     * to {@link OptimisticLockConflictException}, our own proactive
     * expectedVersion check) — a genuine race where two writes both passed
     * that check before either committed. Never surfaces the underlying
     * Hibernate message, which can include entity/table names.
     */
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleOptimisticLockingFailure(OptimisticLockingFailureException ex) {
        log.warn("Optimistic locking failure", ex);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "This record was changed by another request; reload and try again."));
    }

    /**
     * A supported route called with an unsupported HTTP method (e.g. a
     * stale frontend build, or a routing mismatch) — must surface as a
     * clear 405, never fall through to the generic 500 handler below.
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED).body(Map.of("message", "This HTTP method is not supported for this endpoint"));
    }

    /**
     * A database constraint rejected the write outside our own explicit
     * version check (e.g. a genuine concurrent double-create race on a
     * unique constraint). Deliberately never surfaces {@code ex.getMessage()}
     * — a Postgres constraint-violation message can include the constraint
     * name, column values, and table name.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        log.warn("Data integrity violation", ex);
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "This request conflicts with existing data"));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, HttpMediaTypeNotSupportedException.class})
    public ResponseEntity<Map<String, String>> handleMalformedRequest(Exception ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", "Malformed request"));
    }

    /**
     * Last resort. The real exception is logged server-side only — the
     * response never includes its class, message, or any other detail.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex) {
        log.error("Unexpected error handling API request", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("message", "An unexpected error occurred"));
    }
}
