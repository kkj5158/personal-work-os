package com.kafka.backend.checklist;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChecklistDailyEntryRepository extends JpaRepository<ChecklistDailyEntry, UUID> {

    List<ChecklistDailyEntry> findByWorkRecordIdOrderByPositionAsc(UUID workRecordId);

    boolean existsByWorkRecordId(UUID workRecordId);

    Optional<ChecklistDailyEntry> findByIdAndUserId(UUID id, UUID userId);

    List<ChecklistDailyEntry> findByUserIdAndWorkDateBetween(UUID userId, LocalDate from, LocalDate to);

    List<ChecklistDailyEntry> findByUserIdAndItemIdAndWorkDateBetweenOrderByWorkDateAsc(UUID userId, UUID itemId, LocalDate from, LocalDate to);
}
