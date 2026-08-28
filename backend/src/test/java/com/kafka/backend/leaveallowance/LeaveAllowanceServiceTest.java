package com.kafka.backend.leaveallowance;

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
    private CurrentUserProvider currentUserProvider;

    private LeaveAllowanceService newService() {
        return new LeaveAllowanceService(repository, workRecordRepository, currentUserProvider);
    }

    private static WorkRecord recordWithStatus(LocalDate date, WorkAttendanceStatus status) {
        WorkRecord record = new WorkRecord(USER_ID, date);
        record.applyChanges(status, null, null, null, null, null, null, null, null, null, null, false, null);
        return record;
    }

    @Test
    void unconfiguredMonthHasNullAllowanceAndNullRemaining() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8)).thenReturn(Optional.empty());
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(any(), any(), any())).thenReturn(List.of());

        LeaveMonthSummary summary = newService().getSummary(AUGUST_2026);

        assertThat(summary.allowanceDays()).isNull();
        assertThat(summary.remainingDays()).isNull();
        assertThat(summary.usedDays()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void configuredZeroIsDistinctFromUnconfigured() {
        MonthlyLeaveAllowance zeroAllowance = new MonthlyLeaveAllowance(USER_ID, 2026, 8, BigDecimal.ZERO);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndYearAndMonth(USER_ID, 2026, 8)).thenReturn(Optional.of(zeroAllowance));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(any(), any(), any())).thenReturn(List.of());

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

        LeaveAllowanceService service = newService();

        // Already used 1.5 days — dropping the allowance to 1.0 must be rejected.
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

        LeaveAllowanceService service = newService();

        assertThatThrownBy(() -> service.requireSufficientBalance(USER_ID, historicalDate, WorkAttendanceStatus.HALF_DAY))
                .isInstanceOf(InvalidRequestException.class);
    }
}
