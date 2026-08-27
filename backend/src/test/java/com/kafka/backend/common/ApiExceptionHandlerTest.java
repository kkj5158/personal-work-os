package com.kafka.backend.common;

import com.kafka.backend.worksettings.WorkSettingsNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Locks in the sanitized error contract (docs §12 of the Work Log backend
 * task / ApiExceptionHandler's own class doc): every response body is the
 * fixed {@code {"message": ...}} shape, and an unexpected or
 * database-originated exception never leaks its own message, class, or any
 * SQL/constraint/infrastructure detail to the client.
 */
class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void notFoundMapsTo404WithItsOwnMessage() {
        ResponseEntity<?> response = handler.handleNotFound(new ResourceNotFoundException("Start time criterion not found"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).isEqualTo(java.util.Map.of("message", "Start time criterion not found"));
    }

    @Test
    void invalidRequestMapsTo400() {
        ResponseEntity<?> response = handler.handleInvalidRequest(new InvalidRequestException("bad input"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void optimisticLockConflictMapsTo409() {
        ResponseEntity<?> response = handler.handleOptimisticLockConflict(new OptimisticLockConflictException("stale"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void workSettingsNotFoundMapsTo404() {
        ResponseEntity<?> response = handler.handleWorkSettingsNotFound(new WorkSettingsNotFoundException(UUID.randomUUID(), 2026));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void dataIntegrityViolationMapsTo409AndNeverLeaksTheRawExceptionMessage() {
        DataIntegrityViolationException ex = new DataIntegrityViolationException(
                "duplicate key value violates unique constraint \"uq_work_records_user_date\" DETAIL: Key (user_id, work_date)=(...) already exists."
        );

        ResponseEntity<?> response = handler.handleDataIntegrityViolation(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isEqualTo(java.util.Map.of("message", "This request conflicts with existing data"));
    }

    @Test
    void unexpectedExceptionMapsTo500AndNeverLeaksItsMessage() {
        RuntimeException ex = new RuntimeException("jdbc:postgresql://internal-host:5432/db failed with password 'sekret'");

        ResponseEntity<?> response = handler.handleUnexpected(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isEqualTo(java.util.Map.of("message", "An unexpected error occurred"));
        assertThat(response.getBody().toString()).doesNotContain("sekret", "internal-host", "jdbc:postgresql");
    }

    @Test
    void realOptimisticLockingFailureMapsTo409AndNeverLeaksTheRawHibernateMessage() {
        // The genuine JPA/Hibernate exception (as opposed to
        // OptimisticLockConflictException, our own proactive expectedVersion
        // check) — this is what a real race at flush time throws, and its
        // message can name the entity class.
        org.springframework.orm.ObjectOptimisticLockingFailureException ex =
                new org.springframework.orm.ObjectOptimisticLockingFailureException("com.kafka.backend.workrecord.WorkRecord", UUID.randomUUID());

        ResponseEntity<?> response = handler.handleOptimisticLockingFailure(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().toString()).doesNotContain("com.kafka.backend.workrecord.WorkRecord");
    }

    @Test
    void unsupportedHttpMethodMapsTo405NotTheGenericHandler() {
        org.springframework.web.HttpRequestMethodNotSupportedException ex =
                new org.springframework.web.HttpRequestMethodNotSupportedException("DELETE", java.util.List.of("GET", "PUT"));

        ResponseEntity<?> response = handler.handleMethodNotSupported(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(response.getBody().toString()).doesNotContain("HttpRequestMethodNotSupportedException");
    }
}
