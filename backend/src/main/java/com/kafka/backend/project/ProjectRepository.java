package com.kafka.backend.project;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    List<Project> findByUserIdOrderBySortOrderAscNameAsc(UUID userId);

    Optional<Project> findByIdAndUserId(UUID id, UUID userId);
}
