package com.kafka.backend.worktimeentry;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WorkTimeEntryRepository extends JpaRepository<WorkTimeEntry, UUID> {

    List<WorkTimeEntry> findByWorkRecordIdOrderByPositionAsc(UUID workRecordId);

    List<WorkTimeEntry> findByWorkRecordIdInOrderByWorkRecordIdAscPositionAsc(List<UUID> workRecordIds);

    Optional<WorkTimeEntry> findByIdAndUserId(UUID id, UUID userId);

    /** Used by ActivityCategory deletion: a child category referenced by any
     *  work-time entry (any user's — deletion is already scoped to the
     *  category's own owner before this is ever consulted) must never be
     *  physically deleted. */
    boolean existsByCategoryId(UUID categoryId);
}
