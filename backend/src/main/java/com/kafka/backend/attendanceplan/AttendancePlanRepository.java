package com.kafka.backend.attendanceplan;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttendancePlanRepository extends JpaRepository<AttendancePlan, UUID> {

    Optional<AttendancePlan> findByUserIdAndPlanDate(UUID userId, LocalDate planDate);

    List<AttendancePlan> findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(UUID userId, LocalDate from, LocalDate to);

    boolean existsByUserIdAndStartTimeCriterionId(UUID userId, UUID startTimeCriterionId);
}
