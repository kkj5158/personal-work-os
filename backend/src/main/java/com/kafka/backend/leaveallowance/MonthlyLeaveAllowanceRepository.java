package com.kafka.backend.leaveallowance;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface MonthlyLeaveAllowanceRepository extends JpaRepository<MonthlyLeaveAllowance, UUID> {

    Optional<MonthlyLeaveAllowance> findByUserIdAndYearAndMonth(UUID userId, int year, int month);
}
