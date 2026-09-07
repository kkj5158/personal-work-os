package com.kafka.backend.calendar;

import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.lifecategory.LifeCategoryRepository;
import com.kafka.backend.lifetime.LifeTimeEntry;
import com.kafka.backend.lifetime.LifeTimeEntryRepository;
import com.kafka.backend.project.PhaseRepository;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import com.kafka.backend.worktimeentry.WorkTimeEntry;
import com.kafka.backend.worktimeentry.WorkTimeEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Backs the Batch Actual Editor ("실행으로 가져오기") — multi-plan or whole-day
 * Plan-to-Actual import. Nothing is persisted unless every row validates;
 * see {@link BatchActualResponse#committed()}. This is a convenience/prefill
 * workflow only — no persistent Plan<->Actual link is ever created, and the
 * source PlanningBlock is never modified.
 */
@Service
public class BatchActualService {

    private final CurrentUserProvider currentUserProvider;
    private final WorkRecordRepository workRecordRepository;
    private final WorkTimeEntryRepository workTimeEntryRepository;
    private final LifeTimeEntryRepository lifeTimeEntryRepository;
    private final ActivityCategoryRepository activityCategoryRepository;
    private final LifeCategoryRepository lifeCategoryRepository;
    private final PhaseRepository phaseRepository;
    private final ActualOverlapChecker overlapChecker;

    public BatchActualService(
            CurrentUserProvider currentUserProvider,
            WorkRecordRepository workRecordRepository,
            WorkTimeEntryRepository workTimeEntryRepository,
            LifeTimeEntryRepository lifeTimeEntryRepository,
            ActivityCategoryRepository activityCategoryRepository,
            LifeCategoryRepository lifeCategoryRepository,
            PhaseRepository phaseRepository,
            ActualOverlapChecker overlapChecker
    ) {
        this.currentUserProvider = currentUserProvider;
        this.workRecordRepository = workRecordRepository;
        this.workTimeEntryRepository = workTimeEntryRepository;
        this.lifeTimeEntryRepository = lifeTimeEntryRepository;
        this.activityCategoryRepository = activityCategoryRepository;
        this.lifeCategoryRepository = lifeCategoryRepository;
        this.phaseRepository = phaseRepository;
        this.overlapChecker = overlapChecker;
    }

    @Transactional
    public BatchActualResponse commit(LocalDate date, List<BatchActualItemRequest> items) {
        if (date == null) {
            throw new InvalidRequestException("date is required");
        }
        if (items == null || items.isEmpty()) {
            throw new InvalidRequestException("items must not be empty");
        }

        UUID userId = currentUserProvider.getCurrentUserId();
        List<ActualOverlapChecker.Interval> simulated = new ArrayList<>(overlapChecker.scheduledIntervals(userId, date));
        List<BatchActualItemResult> validation = new ArrayList<>();
        boolean allValid = true;

        for (int index = 0; index < items.size(); index++) {
            BatchActualItemRequest item = items.get(index);
            String error = validateItem(item, userId);
            if (error == null && item.startTime() != null) {
                OffsetDateTime startAt = AppTimeZone.toStored(date.atTime(item.startTime()));
                OffsetDateTime endAt = AppTimeZone.toStored(date.atTime(item.endTime()));
                boolean conflicts = simulated.stream()
                        .anyMatch(other -> startAt.isBefore(other.endAt()) && endAt.isAfter(other.startAt()));
                if (conflicts) {
                    error = "다른 항목과 시간이 겹칩니다.";
                } else {
                    simulated.add(new ActualOverlapChecker.Interval(null, null, item.title(), startAt, endAt));
                }
            }
            if (error != null) {
                allValid = false;
            }
            validation.add(new BatchActualItemResult(index, error == null, error, null, null));
        }

        if (!allValid) {
            return new BatchActualResponse(false, validation);
        }

        // WORK items need an existing workday WorkRecord to attach to — Batch
        // Actual never creates or changes attendance status itself (that is
        // AttendancePlan/WorkRecord's own decision, out of this feature's scope).
        WorkRecord workRecord = workRecordRepository.findByUserIdAndWorkDate(userId, date).orElse(null);
        boolean hasWorkItem = items.stream().anyMatch(item -> "WORK".equals(item.domainType()));
        if (hasWorkItem && (workRecord == null || !workRecord.getStatus().isWorkday())) {
            List<BatchActualItemResult> results = new ArrayList<>();
            for (int index = 0; index < items.size(); index++) {
                boolean isWork = "WORK".equals(items.get(index).domainType());
                results.add(new BatchActualItemResult(
                        index, !isWork, isWork ? "이 날짜에 근무 근태가 설정되어 있지 않습니다. 먼저 근태를 설정해주세요." : null, null, null
                ));
            }
            return new BatchActualResponse(false, results);
        }

        int nextWorkPosition = workRecord == null ? 0 : workTimeEntryRepository.findByWorkRecordIdOrderByPositionAsc(workRecord.getId()).size();
        List<BatchActualItemResult> committed = new ArrayList<>();
        for (int index = 0; index < items.size(); index++) {
            BatchActualItemRequest item = items.get(index);
            OffsetDateTime startAt = item.startTime() == null ? null : AppTimeZone.toStored(date.atTime(item.startTime()));
            OffsetDateTime endAt = item.endTime() == null ? null : AppTimeZone.toStored(date.atTime(item.endTime()));

            if ("WORK".equals(item.domainType())) {
                WorkTimeEntry entry = new WorkTimeEntry(
                        UUID.randomUUID(), userId, workRecord.getId(), item.categoryId(),
                        item.title().trim(), item.durationMinutes(), normalizeMemo(item.memo()), nextWorkPosition++
                );
                if (startAt != null) {
                    entry.schedule(startAt, endAt);
                }
                entry.setPhaseId(item.phaseId());
                workTimeEntryRepository.save(entry);
                committed.add(new BatchActualItemResult(index, true, null, ActualSourceType.WORK_TIME_ENTRY, entry.getId()));
            } else {
                LifeTimeEntry entry = new LifeTimeEntry(
                        userId, date, item.categoryId(), item.title().trim(), item.durationMinutes(), startAt, endAt, normalizeMemo(item.memo())
                );
                lifeTimeEntryRepository.save(entry);
                committed.add(new BatchActualItemResult(index, true, null, ActualSourceType.LIFE_TIME_ENTRY, entry.getId()));
            }
        }

        return new BatchActualResponse(true, committed);
    }

    private String validateItem(BatchActualItemRequest item, UUID userId) {
        if (item.domainType() == null || (!item.domainType().equals("WORK") && !item.domainType().equals("LIFE"))) {
            return "domainType must be WORK or LIFE";
        }
        if (item.title() == null || item.title().isBlank()) {
            return "제목을 입력해주세요.";
        }
        if (item.durationMinutes() == null || item.durationMinutes() <= 0) {
            return "소요 시간이 올바르지 않습니다.";
        }
        if ((item.startTime() == null) != (item.endTime() == null)) {
            return "시작/종료 시간을 함께 입력해주세요.";
        }
        if (item.startTime() != null && !item.endTime().isAfter(item.startTime())) {
            return "종료 시간은 시작 시간 이후여야 합니다.";
        }
        if (item.categoryId() != null) {
            boolean ownsCategory = "WORK".equals(item.domainType())
                    ? activityCategoryRepository.findByIdAndUserId(item.categoryId(), userId).isPresent()
                    : lifeCategoryRepository.findByIdAndUserId(item.categoryId(), userId).isPresent();
            if (!ownsCategory) {
                return "카테고리를 찾을 수 없습니다.";
            }
        }
        if (item.phaseId() != null && phaseRepository.findByIdAndUserId(item.phaseId(), userId).isEmpty()) {
            return "Phase를 찾을 수 없습니다.";
        }
        return null;
    }

    private String normalizeMemo(String memo) {
        if (memo == null) return null;
        String trimmed = memo.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
