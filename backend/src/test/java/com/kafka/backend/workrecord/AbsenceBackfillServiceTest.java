package com.kafka.backend.workrecord;

import com.kafka.backend.attendanceplan.AttendancePlan;
import com.kafka.backend.attendanceplan.AttendancePlanRepository;
import com.kafka.backend.common.AllUserIdsRepository;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.workschedule.EffectiveWorkSchedule;
import com.kafka.backend.workschedule.EffectiveWorkScheduleService;
import com.kafka.backend.workschedule.PlannedStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AbsenceBackfillServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();

    @Mock
    private WorkRecordRepository workRecordRepository;

    @Mock
    private AllUserIdsRepository allUserIdsRepository;

    @Mock
    private AttendancePlanRepository attendancePlanRepository;

    @Mock
    private EffectiveWorkScheduleService effectiveWorkScheduleService;

    @Mock
    private AbsenceRecordWriter absenceRecordWriter;

    private AbsenceBackfillService newService() throws Exception {
        AbsenceBackfillService service = new AbsenceBackfillService(
                workRecordRepository, allUserIdsRepository, attendancePlanRepository, effectiveWorkScheduleService, absenceRecordWriter
        );
        Field windowField = AbsenceBackfillService.class.getDeclaredField("backfillWindowDays");
        windowField.setAccessible(true);
        windowField.set(service, 5);
        return service;
    }

    private static EffectiveWorkSchedule schedule(LocalDate date, PlannedStatus status) {
        return new EffectiveWorkSchedule(date, status, null, null, null, null);
    }

    private void noPlansInRange(LocalDate from, LocalDate to) {
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, from, to)).thenReturn(List.of());
    }

    // --- Legacy schedule-based fallback (no plan on file) ---

    @Test
    void createsAbsenceOnlyForPlannedWorkdaysWithNoRecord() throws Exception {
        LocalDate to = LocalDate.now(AppTimeZone.ZONE).minusDays(1);
        LocalDate from = to.minusDays(4);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, from, to))
                .thenReturn(List.of());
        noPlansInRange(from, to);
        Map<LocalDate, EffectiveWorkSchedule> schedules = new HashMap<>();
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            schedules.put(d, schedule(d, PlannedStatus.WORK));
        }
        when(effectiveWorkScheduleService.resolveRange(USER_ID, from, to)).thenReturn(schedules);
        when(absenceRecordWriter.createIfMissing(eq(USER_ID), any(), eq(WorkAttendanceStatus.ABSENT))).thenReturn(true);

        int created = newService().backfillForUser(USER_ID, from, to);

        assertThat(created).isEqualTo(5);
        verify(absenceRecordWriter, times(5)).createIfMissing(eq(USER_ID), any(), eq(WorkAttendanceStatus.ABSENT));
    }

    @Test
    void skipsDatesNotPlannedAsAWorkday() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date))
                .thenReturn(List.of());
        noPlansInRange(date, date);
        when(effectiveWorkScheduleService.resolveRange(USER_ID, date, date))
                .thenReturn(Map.of(date, schedule(date, PlannedStatus.DAY_OFF)));

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isZero();
        verify(absenceRecordWriter, never()).createIfMissing(any(), any(), any());
    }

    @Test
    void skipsDatesThatAlreadyHaveARecord() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);
        WorkRecord existing = new WorkRecord(USER_ID, date);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date))
                .thenReturn(List.of(existing));
        noPlansInRange(date, date);

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isZero();
        verify(effectiveWorkScheduleService, never()).resolveRange(any(), any(), any());
        verify(absenceRecordWriter, never()).createIfMissing(any(), any(), any());
    }

    @Test
    void skipsUsersWithNoWorkSettingsForThatYearRatherThanGuessing() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date))
                .thenReturn(List.of());
        noPlansInRange(date, date);
        when(effectiveWorkScheduleService.resolveRange(USER_ID, date, date)).thenReturn(Map.of());

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isZero();
        verify(absenceRecordWriter, never()).createIfMissing(any(), any(), any());
    }

    @Test
    void backfillAllUsersNeverQueriesTodayOrAFutureDate() throws Exception {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        LocalDate yesterday = today.minusDays(1);
        LocalDate expectedFrom = today.minusDays(5);

        when(allUserIdsRepository.findAllUserIds()).thenReturn(List.of(USER_ID));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, expectedFrom, yesterday))
                .thenReturn(List.of());
        noPlansInRange(expectedFrom, yesterday);
        Map<LocalDate, EffectiveWorkSchedule> schedules = new HashMap<>();
        for (LocalDate d = expectedFrom; !d.isAfter(yesterday); d = d.plusDays(1)) {
            schedules.put(d, schedule(d, PlannedStatus.DAY_OFF));
        }
        when(effectiveWorkScheduleService.resolveRange(USER_ID, expectedFrom, yesterday)).thenReturn(schedules);

        newService().backfillAllUsers();

        verify(workRecordRepository).findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, expectedFrom, yesterday);
        verify(effectiveWorkScheduleService).resolveRange(USER_ID, expectedFrom, yesterday);
    }

    @Test
    void emptyRangeWhenToIsBeforeFromCreatesNothing() throws Exception {
        LocalDate to = LocalDate.now(AppTimeZone.ZONE).minusDays(10);
        LocalDate from = LocalDate.now(AppTimeZone.ZONE).minusDays(1);

        int created = newService().backfillForUser(USER_ID, from, to);

        assertThat(created).isZero();
        verify(workRecordRepository, never()).findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(any(), any(), any());
    }

    // --- Plan-aware reconciliation (attendance management batch) ---

    @Test
    void aPlannedWorkDayWithNoActualRecordBecomesAbsent() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);
        AttendancePlan plan = new AttendancePlan(USER_ID, date);
        plan.update(WorkAttendanceStatus.WORK, UUID.randomUUID(), null);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date)).thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, date, date)).thenReturn(List.of(plan));
        when(absenceRecordWriter.createIfMissing(USER_ID, date, WorkAttendanceStatus.ABSENT)).thenReturn(true);

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isEqualTo(1);
        verify(absenceRecordWriter).createIfMissing(USER_ID, date, WorkAttendanceStatus.ABSENT);
        verify(effectiveWorkScheduleService, never()).resolveRange(any(), any(), any());
    }

    @Test
    void aPlannedHalfDayWithNoActualRecordBecomesAbsent() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);
        AttendancePlan plan = new AttendancePlan(USER_ID, date);
        plan.update(WorkAttendanceStatus.HALF_DAY, UUID.randomUUID(), null);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date)).thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, date, date)).thenReturn(List.of(plan));
        when(absenceRecordWriter.createIfMissing(USER_ID, date, WorkAttendanceStatus.ABSENT)).thenReturn(true);

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isEqualTo(1);
        verify(absenceRecordWriter).createIfMissing(USER_ID, date, WorkAttendanceStatus.ABSENT);
    }

    @Test
    void aPlannedAnnualLeaveWithNoActualRecordIsConfirmedAsAnnualLeave() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);
        AttendancePlan plan = new AttendancePlan(USER_ID, date);
        plan.update(WorkAttendanceStatus.PAID_LEAVE, null, null);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date)).thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, date, date)).thenReturn(List.of(plan));
        when(absenceRecordWriter.createIfMissing(USER_ID, date, WorkAttendanceStatus.PAID_LEAVE)).thenReturn(true);

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isEqualTo(1);
        verify(absenceRecordWriter).createIfMissing(USER_ID, date, WorkAttendanceStatus.PAID_LEAVE);
        verify(absenceRecordWriter, never()).createIfMissing(USER_ID, date, WorkAttendanceStatus.ABSENT);
    }

    @Test
    void aPlannedHolidayWithNoActualRecordIsConfirmedAsHoliday() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);
        AttendancePlan plan = new AttendancePlan(USER_ID, date);
        plan.update(WorkAttendanceStatus.DAY_OFF, null, null);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date)).thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, date, date)).thenReturn(List.of(plan));
        when(absenceRecordWriter.createIfMissing(USER_ID, date, WorkAttendanceStatus.DAY_OFF)).thenReturn(true);

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isEqualTo(1);
        verify(absenceRecordWriter).createIfMissing(USER_ID, date, WorkAttendanceStatus.DAY_OFF);
    }

    @Test
    void aPlanIsNeverConsultedWhenAnActualRecordAlreadyExists() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);
        WorkRecord existing = new WorkRecord(USER_ID, date);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date)).thenReturn(List.of(existing));
        noPlansInRange(date, date);

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isZero();
        verify(absenceRecordWriter, never()).createIfMissing(any(), any(), any());
    }

    @Test
    void rerunningReconciliationIsIdempotentOnceTheRecordExists() throws Exception {
        // Simulates a second run after the first already wrote the row: the
        // writer itself re-checks existence, so a second call for the same
        // date simply returns false (no duplicate) — verified at the writer
        // level (AbsenceRecordWriterTest), exercised here end-to-end via the
        // stub returning false as the writer would on a genuine re-run.
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);
        AttendancePlan plan = new AttendancePlan(USER_ID, date);
        plan.update(WorkAttendanceStatus.PAID_LEAVE, null, null);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date)).thenReturn(List.of());
        when(attendancePlanRepository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(USER_ID, date, date)).thenReturn(List.of(plan));
        when(absenceRecordWriter.createIfMissing(USER_ID, date, WorkAttendanceStatus.PAID_LEAVE)).thenReturn(false);

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isZero();
    }
}
