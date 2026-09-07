package com.kafka.backend.project;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class ProjectService {

    private final ProjectRepository repository;
    private final PhaseRepository phaseRepository;
    private final CurrentUserProvider currentUserProvider;

    public ProjectService(ProjectRepository repository, PhaseRepository phaseRepository, CurrentUserProvider currentUserProvider) {
        this.repository = repository;
        this.phaseRepository = phaseRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public List<Project> list() {
        return repository.findByUserIdOrderBySortOrderAscNameAsc(currentUserProvider.getCurrentUserId());
    }

    public Project create(String name, String colorToken) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Project name must not be blank");
        }
        UUID userId = currentUserProvider.getCurrentUserId();
        return repository.save(new Project(userId, name.trim(), normalizeColorToken(colorToken)));
    }

    public Project update(UUID id, String name, String colorToken) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Project name must not be blank");
        }
        Project project = findOwned(id);
        project.update(name.trim(), normalizeColorToken(colorToken));
        return repository.save(project);
    }

    @Transactional
    public void delete(UUID id) {
        Project project = findOwned(id);
        if (phaseRepository.existsByProjectId(project.getId())) {
            throw new InvalidRequestException("Project has phases and cannot be deleted");
        }
        repository.delete(project);
    }

    Project findOwned(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        return repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Project not found: " + id));
    }

    private String normalizeColorToken(String colorToken) {
        return (colorToken == null || colorToken.isBlank()) ? "slate" : colorToken.trim();
    }
}
