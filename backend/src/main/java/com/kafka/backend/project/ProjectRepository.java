package com.kafka.backend.project;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    List<Project> findByUserIdOrderBySortOrderAscNameAsc(UUID userId);

    Optional<Project> findByIdAndUserId(UUID id, UUID userId);

    @Query(value = "select exists(select 1 from work_tasks where project_id = :id)", nativeQuery = true)
    boolean hasWorkTasks(UUID id);
}
