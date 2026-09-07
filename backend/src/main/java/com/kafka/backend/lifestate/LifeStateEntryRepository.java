package com.kafka.backend.lifestate;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LifeStateEntryRepository extends JpaRepository<LifeStateEntry, UUID> {

    Optional<LifeStateEntry> findByIdAndUserId(UUID id, UUID userId);

    List<LifeStateEntry> findByUserIdAndEntryDateBetweenOrderByStartAtAsc(UUID userId, LocalDate from, LocalDate to);
}
