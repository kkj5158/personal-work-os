package com.kafka.backend.leaveallowance;

import com.kafka.backend.attendanceplan.AttendancePlan;
import com.kafka.backend.attendanceplan.AttendancePlanRepository;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.workrecord.WorkAttendanceStatus;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LeaveAllowanceServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final YearMonth AUGUST_2026 = YearMonth.of(2026, 8);

    @Mock
    private MonthlyLeaveAllowanceRepository repository;

    @Mock
    private WorkRecordRepository workRecordRepository;

    @Mock
    private AttendancePlanRepository attendancePlanRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private LeaveAllowanceService newService() {
        return new LeaveAllowanceService(repository, workRecordRepository, attendancePlanRepository, currentUserProvider);
    }

    private static WorkRecord recordWithStatus(LocalDate date, WorkAttendanceStatus status) {
        WorkRecord record = new WorkRecord(USER_ID, date);
        record.applyChanges(status, null, null, null, null, null, null, null, null, null, null, false, null);
        return record;
    }

    private static AttendancePlan planWithStatus(LocalDate date, WorkAttendanceStatus status) {
        AttendancePlan plan = new AttendancePlan(USER_ID, date);
        plan.update(status, status.isWorkday() ? UUID.randomUUID() : null, null);
        return plan;
    }

    /** Stubs "no plans in range" — needed by every path that reaches
     *  computePlannedLeave, which always queries the plan repository even
     *  when the eventual sum is zero. */
    private void noPlansThisMonth() {
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of());
    }

    @Test
    void unconfiguredMonthHasNullAllowanceAndNullRemaining() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8)).thenReturn(Optional.empty());
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(any(), any(), any())).thenReturn(List.of());
        noPlansThisMonth();

        LeaveMonthSummary summary = newService().getSummary(AUGUST_2026);

        assertThat(summary.allowanceDays()).isNull();
        assertThat(summary.remainingDays()).isNull();
        assertThat(summary.usedDays()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(summary.plannedDays()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void configuredZeroIsDistinctFromUnconfigured() {
        MonthlyLeaveAllowance zeroAllowance = new MonthlyLeaveAllowance(USER_ID, 2026, 8, BigDecimal.ZERO);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8)).thenReturn(Optional.of(zeroAllowance));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(any(), any(), any())).thenReturn(List.of());
        noPlansThisMonth();

        LeaveMonthSummary summary = newService().getSummary(AUGUST_2026);

        assertThat(summary.allowanceDays()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(summary.remainingDays()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void usageSumsPaidLeaveAsOneAndHalfDayAsHalf() {
        List<WorkRecord> records = List.of(
                recordWithStatus(LocalDate.of(2026, 8, 3), WorkAttendanceStatus.PAID_LEAVE),
                recordWithStatus(LocalDate.of(2026, 8, 10), WorkAttendanceStatus.HALF_DAY),
                recordWithStatus(LocalDate.of(2026, 8, 11), WorkAttendanceStatus.WORK)
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8))
                .thenReturn(Optional.of(new MonthlyLeaveAllowance(USER_ID, 2026, 8, new BigDecimal("5"))));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(records);
        noPlansThisMonth();

        LeaveMonthSummary summary = newService().getSummary(AUGUST_2026);

        assertThat(summary.usedDays()).isEqualByComparingTo(new BigDecimal("1.5"));
        assertThat(summary.remainingDays()).isEqualByComparingTo(new BigDecimal("3.5"));
    }

    @Test
    void configureRejectsANegativeAllowance() {
        LeaveAllowanceService service = newService();

        assertThatThrownBy(() -> service.configure(2026, 8, new BigDecimal("-1")))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void configureRejectsAnAllowanceNotOnAHalfDayIncrement() {
        LeaveAllowanceService service = newService();

        assertThatThrownBy(() -> service.configure(2026, 8, new BigDecimal("1.3")))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void configureRejectsLoweringAllowanceBelowAlreadyUsedLeave() {
        List<WorkRecord> records = List.of(
                recordWithStatus(LocalDate.of(2026, 8, 3), WorkAttendanceStatus.PAID_LEAVE),
                recordWithStatus(LocalDate.of(2026, 8, 10), WorkAttendanceStatus.HALF_DAY)
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(records);
        noPlansThisMonth();

        LeaveAllowanceService service = newService();

        // Already used 1.5 days — dropping the allowance to 1.0 must be rejected.
        assertThatThrownBy(() -> service.configure(2026, 8, new BigDecimal("1.0")))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void configureRejectsLoweringAllowanceBelowAlreadyPlannedLeave() {
        // Nothing confirmed yet, but 1.5 days are already outstanding-planned
        // — dropping the allowance to 1.0 must be rejected just as if that
        // 1.5 had already been used.
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of(
                        planWithStatus(LocalDate.of(2026, 8, 20), WorkAttendanceStatus.PAID_LEAVE),
                        planWithStatus(LocalDate.of(2026, 8, 21), WorkAttendanceStatus.HALF_DAY)
                ));

        LeaveAllowanceService service = newService();

        assertThatThrownBy(() -> service.configure(2026, 8, new BigDecimal("1.0")))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void configureAllowsLoweringAllowanceDownToExactlyUsedLeave() {
        List<WorkRecord> records = List.of(
                recordWithStatus(LocalDate.of(2026, 8, 3), WorkAttendanceStatus.PAID_LEAVE),
                recordWithStatus(LocalDate.of(2026, 8, 10), WorkAttendanceStatus.HALF_DAY)
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(records);
        noPlansThisMonth();
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        LeaveAllowanceService service = newService();
        MonthlyLeaveAllowance saved = service.configure(2026, 8, new BigDecimal("1.5"));

        assertThat(saved.getAllowanceDays()).isEqualByComparingTo(new BigDecimal("1.5"));
    }

    @Test
    void requireSufficientBalanceIsANoOpForNonLeaveConsumingStatuses() {
        LeaveAllowanceService service = newService();

        // No repository stubbing at all — reaching the repository would mean
        // this wrongly tried to validate a status that consumes no leave.
        service.requireSufficientBalance(USER_ID, LocalDate.of(2026, 8, 24), WorkAttendanceStatus.WORK);
    }

    @Test
    void requireSufficientBalanceRejectsAnUnconfiguredMonth() {
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8)).thenReturn(Optional.empty());

        LeaveAllowanceService service = newService();

        assertThatThrownBy(() -> service.requireSufficientBalance(USER_ID, LocalDate.of(2026, 8, 24), WorkAttendanceStatus.PAID_LEAVE))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void requireSufficientBalanceAllowsHalfDayWhenExactlyHalfADayRemains() {
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8))
                .thenReturn(Optional.of(new MonthlyLeaveAllowance(USER_ID, 2026, 8, new BigDecimal("0.5"))));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of());
        noPlansThisMonth();

        LeaveAllowanceService service = newService();

        // Must not throw.
        service.requireSufficientBalance(USER_ID, LocalDate.of(2026, 8, 24), WorkAttendanceStatus.HALF_DAY);
    }

    @Test
    void requireSufficientBalanceRejectsFullLeaveWhenOnlyHalfADayRemains() {
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8))
                .thenReturn(Optional.of(new MonthlyLeaveAllowance(USER_ID, 2026, 8, new BigDecimal("0.5"))));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of());
        noPlansThisMonth();

        LeaveAllowanceService service = newService();

        assertThatThrownBy(() -> service.requireSufficientBalance(USER_ID, LocalDate.of(2026, 8, 24), WorkAttendanceStatus.PAID_LEAVE))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void requireSufficientBalanceExcludesTheTargetDatesOwnExistingConsumption() {
        // The date being edited already holds a HALF_DAY (0.5) itself — that
        // must be excluded from "used" before checking whether upgrading it
        // to PAID_LEAVE (1.0) fits, otherwise its own prior usage would be
        // double-counted against itself.
        LocalDate targetDate = LocalDate.of(2026, 8, 24);
        List<WorkRecord> records = List.of(recordWithStatus(targetDate, WorkAttendanceStatus.HALF_DAY));

        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8))
                .thenReturn(Optional.of(new MonthlyLeaveAllowance(USER_ID, 2026, 8, BigDecimal.ONE)));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(records);
        noPlansThisMonth();

        LeaveAllowanceService service = newService();

        // Must not throw: allowance 1.0, used-elsewhere 0.0 (this date's own
        // 0.5 excluded), upgrading this date to PAID_LEAVE (1.0) fits exactly.
        service.requireSufficientBalance(USER_ID, targetDate, WorkAttendanceStatus.PAID_LEAVE);
    }

    @Test
    void requireSufficientBalanceUsesTheTargetDatesOwnMonthNotTheCurrentCalendarMonth() {
        // Simulates editing a historical August record from some later month —
        // validation must consult August's allowance/usage, not whatever
        // "today" happens to be.
        LocalDate historicalDate = LocalDate.of(2026, 8, 24);

        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8))
                .thenReturn(Optional.of(new MonthlyLeaveAllowance(USER_ID, 2026, 8, BigDecimal.ZERO)));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31)))
                .thenReturn(List.of());
        noPlansThisMonth();

        LeaveAllowanceService service = newService();

        assertThatThrownBy(() -> service.requireSufficientBalance(USER_ID, historicalDate, WorkAttendanceStatus.HALF_DAY))
                .isInstanceOf(InvalidRequestException.class);
    }

    // --- Leave reservation via AttendancePlan (attendance management batch) ---

    @Test
    void plannedAnnualLeaveReservesOneFullDay() {
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of(planWithStatus(LocalDate.of(2026, 8, 20), WorkAttendanceStatus.PAID_LEAVE)));

        BigDecimal planned = newService().computePlannedLeave(USER_ID, AUGUST_2026, null);

        assertThat(planned).isEqualByComparingTo(BigDecimal.ONE);
    }

    @Test
    void plannedHalfDayReservesHalfADay() {
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of(planWithStatus(LocalDate.of(2026, 8, 20), WorkAttendanceStatus.HALF_DAY)));

        BigDecimal planned = newService().computePlannedLeave(USER_ID, AUGUST_2026, null);

        assertThat(planned).isEqualByComparingTo(new BigDecimal("0.5"));
    }

    @Test
    void plannedWorkAndHolidayReserveNothing() {
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of(
                        planWithStatus(LocalDate.of(2026, 8, 20), WorkAttendanceStatus.WORK),
                        planWithStatus(LocalDate.of(2026, 8, 21), WorkAttendanceStatus.DAY_OFF)
                ));

        BigDecimal planned = newService().computePlannedLeave(USER_ID, AUGUST_2026, null);

        assertThat(planned).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void overPlanningIsRejectedWhenNotEnoughRemains() {
        // Configured 1.0, nothing confirmed/planned yet — but the new
        // request itself (1.5, PAID_LEAVE) already exceeds what remains.
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8))
                .thenReturn(Optional.of(new MonthlyLeaveAllowance(USER_ID, 2026, 8, BigDecimal.ONE)));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of(planWithStatus(LocalDate.of(2026, 8, 20), WorkAttendanceStatus.HALF_DAY)));

        LeaveAllowanceService service = newService();

        // 1.0 configured - 0.5 already planned (elsewhere) = 0.5 available;
        // a new PAID_LEAVE (1.0) plan for a different date must be rejected.
        assertThatThrownBy(() -> service.requireSufficientBalance(USER_ID, LocalDate.of(2026, 8, 21), WorkAttendanceStatus.PAID_LEAVE))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void aPlanOnTheSameDateBeingValidatedIsExcludedFromItsOwnCheck() {
        // Editing the plan already on this exact date (e.g. HALF_DAY -> PAID_LEAVE)
        // must not double-count that same date's own prior reservation.
        LocalDate date = LocalDate.of(2026, 8, 20);
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8))
                .thenReturn(Optional.of(new MonthlyLeaveAllowance(USER_ID, 2026, 8, BigDecimal.ONE)));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of(planWithStatus(date, WorkAttendanceStatus.HALF_DAY)));

        LeaveAllowanceService service = newService();

        // Must not throw: allowance 1.0, planned-elsewhere 0.0 (this date's
        // own prior 0.5 excluded), upgrading it to PAID_LEAVE (1.0) fits.
        service.requireSufficientBalance(USER_ID, date, WorkAttendanceStatus.PAID_LEAVE);
    }

    @Test
    void aPlanWhoseDateAlreadyHasAnActualRecordNoLongerCountsAsPlanned() {
        // The date became actual (e.g. via reconciliation) — its plan row
        // still exists (kept for history) but must no longer count toward
        // outstanding reservation, since confirmed usage already covers it.
        LocalDate date = LocalDate.of(2026, 8, 20);
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of(recordWithStatus(date, WorkAttendanceStatus.PAID_LEAVE)));
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, AUGUST_2026.atDay(1), AUGUST_2026.atEndOfMonth()))
                .thenReturn(List.of(planWithStatus(date, WorkAttendanceStatus.PAID_LEAVE)));

        BigDecimal planned = newService().computePlannedLeave(USER_ID, AUGUST_2026, null);

        assertThat(planned).isEqualByComparingTo(BigDecimal.ZERO);
    }
}
