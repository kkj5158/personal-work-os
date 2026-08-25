package com.kafka.backend.starttimecriterion;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StartTimeCriterionRepository extends JpaRepository<StartTimeCriterion, UUID> {

    List<StartTimeCriterion> findByUserIdOrderBySortOrderAscNameAsc(UUID userId);

    Optional<StartTimeCriterion> findByIdAndUserId(UUID id, UUID userId);

    /** Scoped strictly to one user — never used to compute another user's next sortOrder. */
    Optional<StartTimeCriterion> findTopByUserIdOrderBySortOrderDesc(UUID userId);
}
