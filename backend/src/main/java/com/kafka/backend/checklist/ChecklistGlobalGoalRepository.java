package com.kafka.backend.checklist;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChecklistGlobalGoalRepository extends JpaRepository<ChecklistGlobalGoal, UUID> {

    List<ChecklistGlobalGoal> findByUserIdOrderByEffectiveFromAsc(UUID userId);

    Optional<ChecklistGlobalGoal> findFirstByUserIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(UUID userId, LocalDate asOf);

    Optional<ChecklistGlobalGoal> findByUserIdAndEffectiveFrom(UUID userId, LocalDate effectiveFrom);
}
