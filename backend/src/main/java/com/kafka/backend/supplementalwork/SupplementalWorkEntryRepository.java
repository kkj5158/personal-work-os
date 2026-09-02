package com.kafka.backend.supplementalwork;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SupplementalWorkEntryRepository extends JpaRepository<SupplementalWorkEntry, UUID> {

    List<SupplementalWorkEntry> findByWorkRecordIdOrderByPositionAsc(UUID workRecordId);

    List<SupplementalWorkEntry> findByWorkRecordIdInOrderByWorkRecordIdAscPositionAsc(List<UUID> workRecordIds);

    Optional<SupplementalWorkEntry> findByIdAndUserId(UUID id, UUID userId);

    /** Used by ActivityCategory deletion: a child category referenced by any
     *  Supplemental Work entry (any user's — deletion is already scoped to
     *  the category's own owner before this is ever consulted) must never be
     *  physically deleted. Mirrors WorkTimeEntryRepository.existsByCategoryId. */
    boolean existsByCategoryId(UUID categoryId);
}
