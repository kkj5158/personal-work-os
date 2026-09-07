package com.kafka.backend.project;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PhaseRepository extends JpaRepository<Phase, UUID> {

    List<Phase> findByProjectIdOrderByStartDateAsc(UUID projectId);

    /** Every phase for one user, most-recently-started first — backs the
     *  Phase selector. Deliberately its own query rather than reusing the
     *  timeline's date-range query with LocalDate.MIN/MAX sentinels: those
     *  values are far outside PostgreSQL's actual `date` range and throw a
     *  DataIntegrityViolationException at the database driver level. */
    List<Phase> findByUserIdOrderByStartDateDesc(UUID userId);

    Optional<Phase> findByIdAndUserId(UUID id, UUID userId);

    /** Phase/Project timeline: every phase whose date range intersects the
     *  requested window, across all of the user's projects. */
    List<Phase> findByUserIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
            UUID userId, LocalDate rangeEnd, LocalDate rangeStart
    );

    boolean existsByProjectId(UUID projectId);
}
