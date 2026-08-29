package com.kafka.backend.workrecord;

import com.kafka.backend.attendanceplan.AttendancePlan;
import com.kafka.backend.attendanceplan.AttendancePlanRepository;
import com.kafka.backend.common.AllUserIdsRepository;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.workschedule.EffectiveWorkScheduleService;
import com.kafka.backend.workschedule.PlannedStatus;
import com.kafka.backend.worksettings.WorkSettingsNotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Reconciles past dates that never received any {@link WorkRecord} at all —
 * both plan-aware confirmation (an {@link AttendancePlan} for that date
 * becomes/confirms the actual outcome) and the original legacy fallback
 * (the user's Planning schedule, {@link EffectiveWorkScheduleService},
 * expected a work day with no plan on file). See
 * docs/product/work-attendance-management-design.md for the full
 * plan-vs-actual reconciliation policy and
 * docs/backend/work-record.md's absence-backfill section for the
 * bounded-window rationale this class predates and still uses.
 *
 * Per date with no existing WorkRecord, in order:
 * <ol>
 *   <li>An AttendancePlan exists: WORK/HALF_DAY with no actual → ABSENT
 *       (a no-show); PAID_LEAVE/DAY_OFF → confirmed as that same status.</li>
 *   <li>No plan at all: falls back to the legacy schedule-based check — the
 *       user's Planning schedule said this date was planned as a work day →
 *       ABSENT. Otherwise the date is left alone (nothing to reconcile
 *       against).</li>
 * </ol>
 */
@Service
public class AbsenceBackfillService {

    private final WorkRecordRepository workRecordRepository;
    private final AllUserIdsRepository allUserIdsRepository;
    private final AttendancePlanRepository attendancePlanRepository;
    private final EffectiveWorkScheduleService effectiveWorkScheduleService;
    private final AbsenceRecordWriter absenceRecordWriter;

    /**
     * How far back a single run will backfill, bounded so a very old or
     * long-dormant account never triggers an unbounded scan. Covers
     * realistic downtime/missed-run recovery (default ~3 months) without
     * being unbounded — see docs/backend/work-record.md for why this
     * specific bound was chosen (no canonical document specifies one).
     */
    @Value("${app.absence-backfill-window-days:90}")
    private int backfillWindowDays;

    public AbsenceBackfillService(
            WorkRecordRepository workRecordRepository,
            AllUserIdsRepository allUserIdsRepository,
            AttendancePlanRepository attendancePlanRepository,
            EffectiveWorkScheduleService effectiveWorkScheduleService,
            AbsenceRecordWriter absenceRecordWriter
    ) {
        this.workRecordRepository = workRecordRepository;
        this.allUserIdsRepository = allUserIdsRepository;
        this.attendancePlanRepository = attendancePlanRepository;
        this.effectiveWorkScheduleService = effectiveWorkScheduleService;
        this.absenceRecordWriter = absenceRecordWriter;
    }

    /** Entry point for the scheduled job — backfills every user, never today or a future date. */
    public int backfillAllUsers() {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        LocalDate to = today.minusDays(1);
        LocalDate from = today.minusDays(backfillWindowDays);

        int created = 0;
        for (UUID userId : allUserIdsRepository.findAllUserIds()) {
            created += backfillForUser(userId, from, to);
        }
        return created;
    }

    /** Package-visible for focused testing of a single user's window without the full user scan. */
    int backfillForUser(UUID userId, LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            return 0;
        }

        List<WorkRecord> existing = workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(userId, from, to);
        Set<LocalDate> existingDates = existing.stream().map(WorkRecord::getWorkDate).collect(Collectors.toSet());

        Map<LocalDate, AttendancePlan> plansByDate = attendancePlanRepository
                .findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(userId, from, to)
                .stream()
                .collect(Collectors.toMap(AttendancePlan::getPlanDate, plan -> plan, (a, b) -> a, HashMap::new));

        int created = 0;
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            if (existingDates.contains(date)) {
                continue;
            }

            AttendancePlan plan = plansByDate.get(date);
            WorkAttendanceStatus resolvedStatus = plan != null ? resolveFromPlan(plan) : resolveFromLegacySchedule(userId, date);
            if (resolvedStatus == null) {
                continue;
            }
            if (absenceRecordWriter.createIfMissing(userId, date, resolvedStatus)) {
                created++;
            }
        }
        return created;
    }

    /** A planned WORK/HALF_DAY with no actual record by the elapsed date is
     *  a no-show → ABSENT. A planned PAID_LEAVE/DAY_OFF is simply confirmed
     *  as that same status — the plan itself is never overwritten/deleted;
     *  only the actual WorkRecord is created alongside it. */
    private WorkAttendanceStatus resolveFromPlan(AttendancePlan plan) {
        return switch (plan.getPlannedStatus()) {
            case PAID_LEAVE, DAY_OFF -> plan.getPlannedStatus();
            case WORK, HALF_DAY -> WorkAttendanceStatus.ABSENT;
            default -> null; // defensive — AttendancePlanService never persists any other status
        };
    }

    /** No plan on file at all — the legacy schedule-based eligibility check
     *  (pre-dates AttendancePlan; kept as the fallback for a date nobody
     *  ever explicitly planned). */
    private WorkAttendanceStatus resolveFromLegacySchedule(UUID userId, LocalDate date) {
        return wasPlannedAsWorkday(userId, date) ? WorkAttendanceStatus.ABSENT : null;
    }

    private boolean wasPlannedAsWorkday(UUID userId, LocalDate date) {
        try {
            return effectiveWorkScheduleService.resolve(userId, date).plannedStatus() == PlannedStatus.WORK;
        } catch (WorkSettingsNotFoundException e) {
            // No yearly WorkSettings defined for this user/year at all —
            // there is no plan to compare against, so we cannot assert an
            // absence against an undefined expectation. Skip, don't guess.
            return false;
        }
    }
}
