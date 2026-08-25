package com.kafka.backend.workrecord;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkRecordRepository extends JpaRepository<WorkRecord, UUID> {

    Optional<WorkRecord> findByUserIdAndWorkDate(UUID userId, LocalDate workDate);

    List<WorkRecord> findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(UUID userId, LocalDate from, LocalDate to);
}
