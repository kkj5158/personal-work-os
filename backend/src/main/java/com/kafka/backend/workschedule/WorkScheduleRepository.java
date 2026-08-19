package com.kafka.backend.workschedule;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface WorkScheduleRepository extends JpaRepository<WorkSchedule, UUID> {

    Optional<WorkSchedule> findByUserIdAndWorkDate(UUID userId, LocalDate workDate);
}
