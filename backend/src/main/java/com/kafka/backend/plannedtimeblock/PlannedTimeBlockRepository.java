package com.kafka.backend.plannedtimeblock;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlannedTimeBlockRepository extends JpaRepository<PlannedTimeBlock, UUID> {

    Optional<PlannedTimeBlock> findByIdAndUserId(UUID id, UUID userId);

    /** Used by ActivityCategory deletion: a child category referenced by any
     *  planned time block must never be physically deleted. */
    boolean existsByActivityCategoryId(UUID activityCategoryId);

    boolean existsByLifeCategoryId(UUID lifeCategoryId);

    boolean existsByPhaseId(UUID phaseId);

    /** Range/overlap query — also used to compute Planning's allowed visual
     *  lane-splitting for the actually-overlapping interval (overlap itself
     *  is never blocked at save time). */
    @Query("""
            select b from PlannedTimeBlock b
            where b.userId = :userId
              and b.startAt < :rangeEnd
              and b.endAt > :rangeStart
            order by b.startAt
            """)
    List<PlannedTimeBlock> findOverlapping(
            @Param("userId") UUID userId,
            @Param("rangeStart") OffsetDateTime rangeStart,
            @Param("rangeEnd") OffsetDateTime rangeEnd
    );
}
