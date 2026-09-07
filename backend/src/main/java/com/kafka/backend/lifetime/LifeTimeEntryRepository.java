package com.kafka.backend.lifetime;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LifeTimeEntryRepository extends JpaRepository<LifeTimeEntry, UUID> {

    Optional<LifeTimeEntry> findByIdAndUserId(UUID id, UUID userId);

    List<LifeTimeEntry> findByUserIdAndEntryDateBetweenOrderByEntryDateAscStartAtAsc(
            UUID userId, LocalDate from, LocalDate to
    );

    boolean existsByLifeCategoryId(UUID lifeCategoryId);
}
