package com.kafka.backend.leaveallowance;

import com.kafka.backend.attendanceplan.AttendancePlan;
import com.kafka.backend.attendanceplan.AttendancePlanRepository;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.workrecord.WorkAttendanceStatus;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Monthly leave allowance configuration and usage. Usage is never stored —
 * it is always derived on demand from {@code work_records} for the target
 * month via {@link WorkAttendanceStatus#leaveConsumption()}, so it can never
 * drift out of sync with actual attendance history. Only the
 * user-configured allowance itself needs its own row per month.
 */
@Service
public class LeaveAllowanceService {

    private final MonthlyLeaveAllowanceRepository repository;
    private final WorkRecordRepository workRecordRepository;
    private final AttendancePlanRepository attendancePlanRepository;
    private final CurrentUserProvider currentUserProvider;

    public LeaveAllowanceService(
            MonthlyLeaveAllowanceRepository repository,
            WorkRecordRepository workRecordRepository,
            AttendancePlanRepository attendancePlanRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.repository = repository;
        this.workRecordRepository = workRecordRepository;
        this.attendancePlanRepository = attendancePlanRepository;
        this.currentUserProvider = currentUserProvider;
    }

    public LeaveMonthSummary getSummary(YearMonth month) {
        UUID userId = currentUserProvider.getCurrentUserId();
        return buildSummary(userId, month);
    }

    private LeaveMonthSummary buildSummary(UUID userId, YearMonth month) {
        BigDecimal used = computeUsedLeave(userId, month, null);
        BigDecimal planned = computePlannedLeave(userId, month, null);
        BigDecimal configured = repository.findByUserIdAndYearAndMonth(userId, month.getYear(), month.getMonthValue())
                .map(MonthlyLeaveAllowance::getAllowanceDays)
                .orElse(null);
        BigDecimal remaining = configured == null ? null : configured.subtract(used).subtract(planned);
        return new LeaveMonthSummary(month.getYear(), month.getMonthValue(), configured, used, planned, remaining);
    }

    /**
     * Sum of {@code leaveConsumption()} across every WorkRecord this user has
     * in the given month, optionally excluding one date (the record
     * currently being saved, so its own *previous* consumption is not
     * double-counted against the *new* status being validated for that same
     * date — see {@code WorkRecordService}).
     */
    public BigDecimal computeUsedLeave(UUID userId, YearMonth month, LocalDate excludeDate) {
        LocalDate from = month.atDay(1);
        LocalDate to = month.atEndOfMonth();
        List<WorkRecord> records = workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(userId, from, to);
        BigDecimal total = BigDecimal.ZERO;
        for (WorkRecord record : records) {
            if (excludeDate != null && record.getWorkDate().equals(excludeDate)) {
                continue;
            }
            total = total.add(record.getStatus().leaveConsumption());
        }
        return total;
    }

    /**
     * Sum of {@code leaveConsumption()} across every leave-consuming
     * AttendancePlan this user has in the given month, excluding any plan
     * whose date already has an actual WorkRecord (that reservation has
     * been superseded by confirmed usage — see
     * docs/product/work-attendance-management-design.md's "no double count"
     * rule) and optionally one date (mirrors {@code computeUsedLeave}'s
     * {@code excludeDate}, used when validating a write to that same date).
     */
    public BigDecimal computePlannedLeave(UUID userId, YearMonth month, LocalDate excludeDate) {
        LocalDate from = month.atDay(1);
        LocalDate to = month.atEndOfMonth();
        List<AttendancePlan> plans = attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(userId, from, to);
        if (plans.isEmpty()) {
            return BigDecimal.ZERO;
        }
        Set<LocalDate> actualDates = new HashSet<>();
        for (WorkRecord record : workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(userId, from, to)) {
            actualDates.add(record.getWorkDate());
        }
        BigDecimal total = BigDecimal.ZERO;
        for (AttendancePlan plan : plans) {
            if (excludeDate != null && plan.getPlanDate().equals(excludeDate)) {
                continue;
            }
            if (actualDates.contains(plan.getPlanDate())) {
                continue;
            }
            total = total.add(plan.getPlannedStatus().leaveConsumption());
        }
        return total;
    }

    /**
     * Creates or updates the configured allowance for one month. The new
     * allowance may never be set below leave already consumed or planned
     * that month — leave balance can never go negative.
     */
    @Transactional
    public MonthlyLeaveAllowance configure(int year, int month, BigDecimal allowanceDays) {
        if (month < 1 || month > 12) {
            throw new InvalidRequestException("Month must be between 1 and 12");
        }
        validateAllowanceShape(allowanceDays);

        UUID userId = currentUserProvider.getCurrentUserId();
        YearMonth yearMonth = YearMonth.of(year, month);
        BigDecimal used = computeUsedLeave(userId, yearMonth, null);
        BigDecimal planned = computePlannedLeave(userId, yearMonth, null);
        BigDecimal committed = used.add(planned);
        if (allowanceDays.compareTo(committed) < 0) {
            throw new InvalidRequestException(
                    "Allowance must not be set below leave already used or planned this month (" + committed + ")"
            );
        }

        MonthlyLeaveAllowance allowance = repository.findByUserIdAndYearAndMonth(userId, year, month)
                .orElseGet(() -> new MonthlyLeaveAllowance(userId, year, month, allowanceDays));
        allowance.setAllowanceDays(allowanceDays);
        return repository.save(allowance);
    }

    /**
     * Validates a prospective leave-consuming write (an actual WorkRecord or
     * an AttendancePlan) against the target date's month balance, excluding
     * whatever that same date already consumes/reserves today in either
     * bucket (so editing a record or a plan never double-counts its own
     * prior state against itself). Throws when the month has never been
     * configured, or when the requested status would exceed configured minus
     * (confirmed + outstanding planned) leave. No-op for a status that
     * consumes no leave. Shared by both WorkRecordService and
     * AttendancePlanService — both draw from the exact same monthly pool.
     */
    public void requireSufficientBalance(UUID userId, LocalDate workDate, WorkAttendanceStatus status) {
        BigDecimal required = status.leaveConsumption();
        if (required.signum() == 0) {
            return;
        }

        YearMonth month = YearMonth.from(workDate);
        MonthlyLeaveAllowance allowance = repository.findByUserIdAndYearAndMonth(userId, month.getYear(), month.getMonthValue())
                .orElseThrow(() -> new InvalidRequestException("Configure this month's leave allowance first."));

        BigDecimal usedExcludingThisDate = computeUsedLeave(userId, month, workDate);
        BigDecimal plannedExcludingThisDate = computePlannedLeave(userId, month, workDate);
        BigDecimal remaining = allowance.getAllowanceDays().subtract(usedExcludingThisDate).subtract(plannedExcludingThisDate);
        if (remaining.compareTo(required) < 0) {
            throw new InvalidRequestException("Not enough remaining leave this month.");
        }
    }

    private void validateAllowanceShape(BigDecimal allowanceDays) {
        if (allowanceDays == null) {
            throw new InvalidRequestException("Allowance is required");
        }
        if (allowanceDays.signum() < 0) {
            throw new InvalidRequestException("Allowance must not be negative");
        }
        // Half-day granularity: doubled value must be a whole number.
        BigDecimal doubled = allowanceDays.multiply(BigDecimal.valueOf(2));
        if (doubled.stripTrailingZeros().scale() > 0) {
            throw new InvalidRequestException("Allowance must be in half-day increments");
        }
    }
}
