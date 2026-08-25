package com.kafka.backend.worktimeentry;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkTimeEntryRepository extends JpaRepository<WorkTimeEntry, UUID> {

    List<WorkTimeEntry> findByWorkRecordIdOrderByPositionAsc(UUID workRecordId);

    Optional<WorkTimeEntry> findByIdAndUserId(UUID id, UUID userId);
}
