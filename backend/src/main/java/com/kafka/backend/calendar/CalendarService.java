package com.kafka.backend.calendar;

import com.kafka.backend.attendanceplan.AttendancePlanRepository;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.lifestate.LifeStateEntryRepository;
import com.kafka.backend.lifetime.LifeTimeEntry;
import com.kafka.backend.lifetime.LifeTimeEntryRepository;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRepository;
import com.kafka.backend.supplementalwork.SupplementalWorkEntry;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryRepository;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import com.kafka.backend.worktimeentry.WorkTimeEntry;
import com.kafka.backend.worktimeentry.WorkTimeEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Aggregates every domain-owned source into the unified Calendar
 * projection (locked V1 policy §4). This is a read-only view assembly —
 * editing must always go through the owning domain record
 * (PlannedTimeBlockService, WorkTimeEntryService, SupplementalWorkEntryService,
 * LifeTimeEntryService, LifeStateEntryService), never through a second
 * persisted copy here.
 */
@Service
public class CalendarService {

    private final PlannedTimeBlockRepository plannedTimeBlockRepository;
    private final WorkRecordRepository workRecordRepository;
    private final WorkTimeEntryRepository workTimeEntryRepository;
    private final SupplementalWorkEntryRepository supplementalWorkEntryRepository;
    private final LifeTimeEntryRepository lifeTimeEntryRepository;
    private final LifeStateEntryRepository lifeStateEntryRepository;
    private final AttendancePlanRepository attendancePlanRepository;
    private final CurrentUserProvider currentUserProvider;

    public CalendarService(
            PlannedTimeBlockRepository plannedTimeBlockRepository,
            WorkRecordRepository workRecordRepository,
            WorkTimeEntryRepository workTimeEntryRepository,
            SupplementalWorkEntryRepository supplementalWorkEntryRepository,
            LifeTimeEntryRepository lifeTimeEntryRepository,
            LifeStateEntryRepository lifeStateEntryRepository,
            AttendancePlanRepository attendancePlanRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.plannedTimeBlockRepository = plannedTimeBlockRepository;
        this.workRecordRepository = workRecordRepository;
        this.workTimeEntryRepository = workTimeEntryRepository;
        this.supplementalWorkEntryRepository = supplementalWorkEntryRepository;
        this.lifeTimeEntryRepository = lifeTimeEntryRepository;
        this.lifeStateEntryRepository = lifeStateEntryRepository;
        this.attendancePlanRepository = attendancePlanRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public CalendarRangeResponse findInRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new InvalidRequestException("to must not be before from");
        }
        UUID userId = currentUserProvider.getCurrentUserId();

        LocalDateTime rangeStartLocal = from.atStartOfDay();
        LocalDateTime rangeEndLocal = to.plusDays(1).atStartOfDay();

        List<CalendarPlanBlockDto> planBlocks = plannedTimeBlockRepository
                .findOverlapping(userId, AppTimeZone.toStored(rangeStartLocal), AppTimeZone.toStored(rangeEndLocal))
                .stream()
                .map(CalendarPlanBlockDto::from)
                .toList();

        List<WorkRecord> workRecords = workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(userId, from, to);
        Map<UUID, LocalDate> workDateByRecordId = workRecords.stream()
                .collect(Collectors.toMap(WorkRecord::getId, WorkRecord::getWorkDate));
        List<UUID> workRecordIds = workRecords.stream().map(WorkRecord::getId).toList();

        List<CalendarActualBlockDto> actualBlocks = new ArrayList<>();
        List<CalendarUnscheduledActualDto> unscheduledActual = new ArrayList<>();

        if (!workRecordIds.isEmpty()) {
            for (WorkTimeEntry entry : workTimeEntryRepository.findByWorkRecordIdInOrderByWorkRecordIdAscPositionAsc(workRecordIds)) {
                LocalDate date = workDateByRecordId.get(entry.getWorkRecordId());
                if (entry.getStartAt() != null) {
                    actualBlocks.add(new CalendarActualBlockDto(
                            ActualSourceType.WORK_TIME_ENTRY, entry.getId(), "WORK", date, entry.getItem(),
                            AppTimeZone.toDisplay(entry.getStartAt()), AppTimeZone.toDisplay(entry.getEndAt()),
                            entry.getMinutes(), entry.getCategoryId(), null, entry.getPhaseId(), entry.getMemo()
                    ));
                } else {
                    unscheduledActual.add(new CalendarUnscheduledActualDto(
                            ActualSourceType.WORK_TIME_ENTRY, entry.getId(), "WORK", date, entry.getItem(),
                            entry.getMinutes(), entry.getCategoryId(), null, entry.getPhaseId(), entry.getMemo()
                    ));
                }
            }
            for (SupplementalWorkEntry entry : supplementalWorkEntryRepository.findByWorkRecordIdInOrderByWorkRecordIdAscPositionAsc(workRecordIds)) {
                LocalDate date = workDateByRecordId.get(entry.getWorkRecordId());
                if (entry.getStartAt() != null) {
                    actualBlocks.add(new CalendarActualBlockDto(
                            ActualSourceType.SUPPLEMENTAL_WORK_ENTRY, entry.getId(), "WORK", date, entry.getItem(),
                            AppTimeZone.toDisplay(entry.getStartAt()), AppTimeZone.toDisplay(entry.getEndAt()),
                            entry.getTotalMinutes(), entry.getCategoryId(), null, entry.getPhaseId(), entry.getMemo()
                    ));
                } else {
                    unscheduledActual.add(new CalendarUnscheduledActualDto(
                            ActualSourceType.SUPPLEMENTAL_WORK_ENTRY, entry.getId(), "WORK", date, entry.getItem(),
                            entry.getTotalMinutes(), entry.getCategoryId(), null, entry.getPhaseId(), entry.getMemo()
                    ));
                }
            }
        }

        for (LifeTimeEntry entry : lifeTimeEntryRepository.findByUserIdAndEntryDateBetweenOrderByEntryDateAscStartAtAsc(userId, from, to)) {
            if (entry.getStartAt() != null) {
                actualBlocks.add(new CalendarActualBlockDto(
                        ActualSourceType.LIFE_TIME_ENTRY, entry.getId(), "LIFE", entry.getEntryDate(), entry.getTitle(),
                        AppTimeZone.toDisplay(entry.getStartAt()), AppTimeZone.toDisplay(entry.getEndAt()),
                        entry.getDurationMinutes(), null, entry.getLifeCategoryId(), null, entry.getMemo()
                ));
            } else {
                unscheduledActual.add(new CalendarUnscheduledActualDto(
                        ActualSourceType.LIFE_TIME_ENTRY, entry.getId(), "LIFE", entry.getEntryDate(), entry.getTitle(),
                        entry.getDurationMinutes(), null, entry.getLifeCategoryId(), null, entry.getMemo()
                ));
            }
        }

        List<CalendarStateBlockDto> stateBlocks = lifeStateEntryRepository
                .findByUserIdAndEntryDateBetweenOrderByStartAtAsc(userId, from, to)
                .stream()
                .map(CalendarStateBlockDto::from)
                .toList();

        List<CalendarAttendanceContextDto> attendanceContext = attendancePlanRepository
                .findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(userId, from, to)
                .stream()
                .map(CalendarAttendanceContextDto::from)
                .toList();

        List<CalendarWorkRecordSummaryDto> workRecordSummaries = workRecords.stream()
                .map(CalendarWorkRecordSummaryDto::from)
                .toList();

        return new CalendarRangeResponse(planBlocks, actualBlocks, unscheduledActual, stateBlocks, attendanceContext, workRecordSummaries);
    }
}
