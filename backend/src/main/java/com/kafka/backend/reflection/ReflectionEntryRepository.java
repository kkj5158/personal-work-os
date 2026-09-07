package com.kafka.backend.reflection;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface ReflectionEntryRepository extends JpaRepository<ReflectionEntry, UUID> {

    Optional<ReflectionEntry> findByUserIdAndEntryDate(UUID userId, LocalDate entryDate);
}
