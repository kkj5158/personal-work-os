package com.kafka.backend.project;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRepository;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryRepository;
import com.kafka.backend.worktimeentry.WorkTimeEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
public class PhaseService {

    private final PhaseRepository repository;
    private final ProjectService projectService;
    private final CurrentUserProvider currentUserProvider;
    private final PlannedTimeBlockRepository plannedTimeBlockRepository;
    private final WorkTimeEntryRepository workTimeEntryRepository;
    private final SupplementalWorkEntryRepository supplementalWorkEntryRepository;

    public PhaseService(
            PhaseRepository repository,
            ProjectService projectService,
            CurrentUserProvider currentUserProvider,
            PlannedTimeBlockRepository plannedTimeBlockRepository,
            WorkTimeEntryRepository workTimeEntryRepository,
            SupplementalWorkEntryRepository supplementalWorkEntryRepository
    ) {
        this.repository = repository;
        this.projectService = projectService;
        this.currentUserProvider = currentUserProvider;
        this.plannedTimeBlockRepository = plannedTimeBlockRepository;
        this.workTimeEntryRepository = workTimeEntryRepository;
        this.supplementalWorkEntryRepository = supplementalWorkEntryRepository;
    }

    @Transactional(readOnly = true)
    public List<Phase> listByProject(UUID projectId) {
        projectService.findOwned(projectId);
        return repository.findByProjectIdOrderByStartDateAsc(projectId);
    }

    /** Phase/Project timeline: every phase intersecting [from, to], across all of the user's projects. */
    @Transactional(readOnly = true)
    public List<Phase> findInRange(LocalDate from, LocalDate to) {
        UUID userId = currentUserProvider.getCurrentUserId();
        return repository.findByUserIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(userId, to, from);
    }

    /** All phases for the searchable Phase selector, most-recently-relevant first. */
    @Transactional(readOnly = true)
    public List<Phase> listAllForSelector() {
        UUID userId = currentUserProvider.getCurrentUserId();
        List<Phase> all = repository.findByUserIdAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
                userId, LocalDate.MAX, LocalDate.MIN
        );
        return all.stream()
                .sorted(Comparator.comparing(Phase::getStartDate).reversed())
                .toList();
    }

    public Phase create(UUID projectId, String title, LocalDate startDate, LocalDate endDate) {
        validateShape(title, startDate, endDate);
        Project project = projectService.findOwned(projectId);
        return repository.save(new Phase(project.getUserId(), project.getId(), title.trim(), startDate, endDate));
    }

    public Phase update(UUID id, String title, LocalDate startDate, LocalDate endDate) {
        validateShape(title, startDate, endDate);
        Phase phase = findOwned(id);
        phase.update(title.trim(), startDate, endDate);
        return repository.save(phase);
    }

    public void delete(UUID id) {
        Phase phase = findOwned(id);
        if (plannedTimeBlockRepository.existsByPhaseId(phase.getId())
                || workTimeEntryRepository.existsByPhaseId(phase.getId())
                || supplementalWorkEntryRepository.existsByPhaseId(phase.getId())) {
            throw new InvalidRequestException("Phase is referenced by existing records and cannot be deleted");
        }
        repository.delete(phase);
    }

    private Phase findOwned(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        return repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Phase not found: " + id));
    }

    private void validateShape(String title, LocalDate startDate, LocalDate endDate) {
        if (title == null || title.isBlank()) {
            throw new InvalidRequestException("Phase title must not be blank");
        }
        if (startDate == null || endDate == null || endDate.isBefore(startDate)) {
            throw new InvalidRequestException("endDate must not be before startDate");
        }
    }
}
