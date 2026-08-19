package com.kafka.backend.timeblockcategory;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TimeBlockCategoryRepository extends JpaRepository<TimeBlockCategory, UUID> {

    List<TimeBlockCategory> findByUserIdOrderBySortOrderAscNameAsc(UUID userId);

    Optional<TimeBlockCategory> findByIdAndUserId(UUID id, UUID userId);
}
