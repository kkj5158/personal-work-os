package com.kafka.backend.checklist;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ChecklistItemVersionRepository extends JpaRepository<ChecklistItemVersion, UUID> {

    List<ChecklistItemVersion> findByItemIdOrderByEffectiveFromAsc(UUID itemId);

    /** The applicable definition as of a given date — the latest version
     *  whose effectiveFrom is on or before it. */
    Optional<ChecklistItemVersion> findFirstByItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDesc(UUID itemId, LocalDate asOf);

    Optional<ChecklistItemVersion> findByItemIdAndEffectiveFrom(UUID itemId, LocalDate effectiveFrom);

    List<ChecklistItemVersion> findByItemIdIn(List<UUID> itemIds);
}
