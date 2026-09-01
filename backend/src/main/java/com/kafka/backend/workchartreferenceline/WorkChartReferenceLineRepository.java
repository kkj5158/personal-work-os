package com.kafka.backend.workchartreferenceline;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkChartReferenceLineRepository extends JpaRepository<WorkChartReferenceLine, UUID> {

    List<WorkChartReferenceLine> findByUserIdOrderByScopeAscPositionAsc(UUID userId);

    List<WorkChartReferenceLine> findByUserIdAndScopeOrderByPositionAsc(UUID userId, WorkChartReferenceLineScope scope);

    Optional<WorkChartReferenceLine> findByIdAndUserId(UUID id, UUID userId);
}
