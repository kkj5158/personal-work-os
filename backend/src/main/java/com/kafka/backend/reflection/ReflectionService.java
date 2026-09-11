package com.kafka.backend.reflection;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.kafka.backend.calendar.CalendarActualBlockDto;
import com.kafka.backend.calendar.CalendarPlanBlockDto;
import com.kafka.backend.calendar.CalendarRangeResponse;
import com.kafka.backend.calendar.CalendarService;
import com.kafka.backend.calendar.CalendarStateBlockDto;
import com.kafka.backend.checklist.ChecklistDailyEntryRepository;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.OptimisticLockConflictException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.notesystem.integration.ReflectionProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * WORK_OS's single Reflection implementation, fulfilling the
 * notesystem.integration.ReflectionProvider boundary Note System already
 * calls. One row per (owner, date) — see ReflectionEntry. Note System never
 * owns or duplicates this data; it only renders through this provider.
 */
@Service
public class ReflectionService implements ReflectionProvider {

    private final ReflectionEntryRepository repository;
    private final CalendarService calendarService;
    private final ChecklistDailyEntryRepository checklistDailyEntryRepository;
    /** A private, self-contained mapper for snapshot (de)serialization only —
     *  deliberately not the application's shared REST ObjectMapper bean, so
     *  this internal storage format never depends on unrelated global
     *  Jackson configuration. */
    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    public ReflectionService(
            ReflectionEntryRepository repository,
            CalendarService calendarService,
            ChecklistDailyEntryRepository checklistDailyEntryRepository
    ) {
        this.repository = repository;
        this.calendarService = calendarService;
        this.checklistDailyEntryRepository = checklistDailyEntryRepository;
    }

    @Transactional(readOnly = true)
    @Override
    public Optional<Entry> findMain(UUID owner, LocalDate date) {
        return repository.findByUserIdAndEntryDate(owner, date).map(this::toEntry);
    }

    @Transactional
    @Override
    public Entry createMain(UUID owner, LocalDate date) {
        return repository.findByUserIdAndEntryDate(owner, date)
                .map(this::toEntry)
                .orElseGet(() -> toEntry(repository.saveAndFlush(new ReflectionEntry(owner, date))));
    }

    /** Autosaves while EDITING. */
    @Transactional
    @Override
    public Entry updateMain(UUID owner, UUID reflectionId, String content, long expectedVersion) {
        ReflectionEntry entry = findOwned(owner, reflectionId);
        checkVersion(entry, expectedVersion);
        entry.updateContent(content);
        return toEntry(repository.saveAndFlush(entry));
    }

    /** 회고 완료: generates and freezes the current structured snapshot. */
    @Transactional
    @Override
    public Entry complete(UUID owner, UUID reflectionId, long expectedVersion) {
        ReflectionEntry entry = findOwned(owner, reflectionId);
        checkVersion(entry, expectedVersion);
        entry.complete(serializeSnapshot(buildSnapshot(owner, entry.getEntryDate())));
        return toEntry(repository.saveAndFlush(entry));
    }

    /** 수정: returns to EDITING; 회고 완료 becomes available again on re-completion. */
    @Transactional
    @Override
    public Entry reopen(UUID owner, UUID reflectionId, long expectedVersion) {
        ReflectionEntry entry = findOwned(owner, reflectionId);
        checkVersion(entry, expectedVersion);
        entry.reopen();
        return toEntry(repository.saveAndFlush(entry));
    }

    @Transactional(readOnly = true)
    @Override
    public Snapshot frozenSnapshot(UUID owner, UUID reflectionId) {
        ReflectionEntry entry = findOwned(owner, reflectionId);
        if (entry.getSnapshotJson() == null) {
            throw new InvalidRequestException("This reflection has not been completed yet — no snapshot exists.");
        }
        return deserializeSnapshot(entry.getSnapshotJson());
    }

    /** Builds the current structured Plan/Actual/State snapshot fresh from
     *  live Calendar data — never partially patched, always regenerated
     *  wholesale on (re-)completion. */
    private Snapshot buildSnapshot(UUID owner, LocalDate date) {
        CalendarRangeResponse range = calendarService.findInRange(date, date);

        List<TimeBlock> plannedBlocks = range.planBlocks().stream().map(this::toTimeBlock).toList();
        List<TimeBlock> actualBlocks = range.actualBlocks().stream().map(this::toTimeBlock).toList();
        List<StateSegment> stateBlocks = range.stateBlocks().stream()
                .map(block -> new StateSegment(
                        block.startAt().toLocalTime(), block.endAt().toLocalTime(),
                        block.stateGroup().name(), block.label()
                ))
                .toList();

        int workPlanned = sumMinutes(range.planBlocks(), CalendarPlanBlockDto::domainType, com.kafka.backend.plannedtimeblock.PlanDomainType.WORK);
        int lifePlanned = sumMinutes(range.planBlocks(), CalendarPlanBlockDto::domainType, com.kafka.backend.plannedtimeblock.PlanDomainType.LIFE);
        int workActual = range.actualBlocks().stream().filter(b -> "WORK".equals(b.domainType())).mapToInt(CalendarActualBlockDto::durationMinutes).sum();
        int lifeActual = range.actualBlocks().stream().filter(b -> "LIFE".equals(b.domainType())).mapToInt(CalendarActualBlockDto::durationMinutes).sum();

        workActual += range.unscheduledActual().stream().filter(b -> "WORK".equals(b.domainType())).mapToInt(com.kafka.backend.calendar.CalendarUnscheduledActualDto::durationMinutes).sum();
        lifeActual += range.unscheduledActual().stream().filter(b -> "LIFE".equals(b.domainType())).mapToInt(com.kafka.backend.calendar.CalendarUnscheduledActualDto::durationMinutes).sum();

        List<com.kafka.backend.checklist.ChecklistDailyEntry> checklistEntries =
                checklistDailyEntryRepository.findByUserIdAndWorkDateBetween(owner, date, date);
        long checklistPassed = checklistEntries.stream()
                .filter(e -> e.getResult() == com.kafka.backend.checklist.ChecklistResult.PASS)
                .count();

        return new Snapshot(
                date, Instant.now(),
                plannedBlocks, actualBlocks, stateBlocks,
                new WorkSummary(workPlanned, workActual),
                new TimeSummary(lifePlanned, lifeActual),
                new ChecklistSummary((int) checklistPassed, checklistEntries.size()), range.unscheduledActual()
        );
    }

    private <T> int sumMinutes(List<CalendarPlanBlockDto> blocks, java.util.function.Function<CalendarPlanBlockDto, T> domainAccessor, T target) {
        return blocks.stream()
                .filter(block -> domainAccessor.apply(block).equals(target))
                .mapToInt(block -> (int) java.time.Duration.between(block.startAt(), block.endAt()).toMinutes())
                .sum();
    }

    private TimeBlock toTimeBlock(CalendarPlanBlockDto block) {
        UUID categoryId = block.activityCategoryId() != null ? block.activityCategoryId() : block.lifeCategoryId();
        return new TimeBlock(
                block.id().toString(), block.startAt().toLocalTime(), block.endAt().toLocalTime(),
                (int) java.time.Duration.between(block.startAt(), block.endAt()).toMinutes(),
                block.title(), categoryId == null ? null : categoryId.toString(), null, block.domainType().name()
        );
    }

    private TimeBlock toTimeBlock(CalendarActualBlockDto block) {
        UUID categoryId = block.activityCategoryId() != null ? block.activityCategoryId() : block.lifeCategoryId();
        return new TimeBlock(
                block.sourceId().toString(), block.startAt().toLocalTime(), block.endAt().toLocalTime(),
                block.durationMinutes(), block.title(), categoryId == null ? null : categoryId.toString(), null, block.domainType()
        );
    }

    private ReflectionEntry findOwned(UUID owner, UUID id) {
        ReflectionEntry entry = repository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Reflection not found: " + id));
        if (!entry.getUserId().equals(owner)) {
            throw new ResourceNotFoundException("Reflection not found: " + id);
        }
        return entry;
    }

    private void checkVersion(ReflectionEntry entry, long expectedVersion) {
        if (!Objects.equals((long) entry.getVersion(), expectedVersion)) {
            throw new OptimisticLockConflictException(
                    "Reflection for " + entry.getEntryDate() + " has changed since it was last read; reload and try again."
            );
        }
    }

    private Entry toEntry(ReflectionEntry entry) {
        Snapshot snapshot = entry.getSnapshotJson() == null ? null : deserializeSnapshot(entry.getSnapshotJson());
        return new Entry(
                entry.getId(), entry.getEntryDate(), entry.getContent(),
                entry.getStatus() == ReflectionStatus.COMPLETED ? ReflectionEntryStatus.COMPLETED : ReflectionEntryStatus.EDITING,
                entry.getVersion(), snapshot, "/calendar?date=" + entry.getEntryDate()
        );
    }

    private String serializeSnapshot(Snapshot snapshot) {
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (Exception e) {
            throw new InvalidRequestException("Failed to serialize reflection snapshot: " + e.getMessage());
        }
    }

    private Snapshot deserializeSnapshot(String json) {
        try {
            return objectMapper.readValue(json, Snapshot.class);
        } catch (Exception e) {
            throw new InvalidRequestException("Failed to read reflection snapshot: " + e.getMessage());
        }
    }
}
