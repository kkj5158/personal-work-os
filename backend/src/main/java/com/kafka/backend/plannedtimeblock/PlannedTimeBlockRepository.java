package com.kafka.backend.plannedtimeblock;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlannedTimeBlockRepository extends JpaRepository<PlannedTimeBlock, UUID> {

    Optional<PlannedTimeBlock> findByUserIdAndConvertedSourceTypeAndConvertedSourceId(UUID userId, String type, UUID sourceId);

    @Query(value="""
            select b.* from planned_time_blocks b where b.user_id=:userId and b.start_at is null
            and b.plan_date between :from and :to and not exists(select 1 from calendar_plan_executions e where e.plan_id=b.id and e.user_id=b.user_id)
              and b.converted_source_id is null
            order by b.plan_date
            """, nativeQuery=true)
    List<PlannedTimeBlock> findByUserIdAndStartAtIsNullAndPlanDateBetweenOrderByPlanDate(UUID userId,java.time.LocalDate from,java.time.LocalDate to);

    Optional<PlannedTimeBlock> findByIdAndUserId(UUID id, UUID userId);

    /** Used by ActivityCategory deletion: a child category referenced by any
     *  planned time block must never be physically deleted. */
    boolean existsByActivityCategoryId(UUID activityCategoryId);

    boolean existsByLifeCategoryId(UUID lifeCategoryId);

    boolean existsByPhaseId(UUID phaseId);

    /** Range/overlap query — also used to compute Planning's allowed visual
     *  lane-splitting for the actually-overlapping interval (overlap itself
     *  is never blocked at save time). */
    @Query(value="""
            select b.* from planned_time_blocks b
            where b.user_id = :userId
              and b.start_at < :rangeEnd
              and b.end_at > :rangeStart
              and not exists(select 1 from calendar_plan_executions e where e.plan_id=b.id and e.user_id=b.user_id)
              and b.converted_source_id is null
            order by b.start_at
            """, nativeQuery=true)
    List<PlannedTimeBlock> findOverlapping(
            @Param("userId") UUID userId,
            @Param("rangeStart") OffsetDateTime rangeStart,
            @Param("rangeEnd") OffsetDateTime rangeEnd
    );
}
