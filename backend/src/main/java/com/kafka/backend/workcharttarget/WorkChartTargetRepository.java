package com.kafka.backend.workcharttarget;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface WorkChartTargetRepository extends JpaRepository<WorkChartTarget, UUID> {

    Optional<WorkChartTarget> findByUserId(UUID userId);
}
