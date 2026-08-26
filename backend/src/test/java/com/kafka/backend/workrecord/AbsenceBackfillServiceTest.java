package com.kafka.backend.workrecord;

import com.kafka.backend.common.AllUserIdsRepository;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.workschedule.EffectiveWorkSchedule;
import com.kafka.backend.workschedule.EffectiveWorkScheduleService;
import com.kafka.backend.workschedule.PlannedStatus;
import com.kafka.backend.worksettings.WorkSettingsNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
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
    private EffectiveWorkScheduleService effectiveWorkScheduleService;

    @Mock
    private AbsenceRecordWriter absenceRecordWriter;

    private AbsenceBackfillService newService() throws Exception {
        AbsenceBackfillService service = new AbsenceBackfillService(
                workRecordRepository, allUserIdsRepository, effectiveWorkScheduleService, absenceRecordWriter
        );
        Field windowField = AbsenceBackfillService.class.getDeclaredField("backfillWindowDays");
        windowField.setAccessible(true);
        windowField.set(service, 5);
        return service;
    }

    private static EffectiveWorkSchedule schedule(LocalDate date, PlannedStatus status) {
        return new EffectiveWorkSchedule(date, status, null, null, null, null);
    }

    @Test
    void createsAbsenceOnlyForPlannedWorkdaysWithNoRecord() throws Exception {
        LocalDate to = LocalDate.now(AppTimeZone.ZONE).minusDays(1);
        LocalDate from = to.minusDays(4);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, from, to))
                .thenReturn(List.of());
        for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
            when(effectiveWorkScheduleService.resolve(USER_ID, d)).thenReturn(schedule(d, PlannedStatus.WORK));
        }
        when(absenceRecordWriter.createAbsenceIfMissing(eq(USER_ID), any())).thenReturn(true);

        int created = newService().backfillForUser(USER_ID, from, to);

        assertThat(created).isEqualTo(5);
        verify(absenceRecordWriter, times(5)).createAbsenceIfMissing(eq(USER_ID), any());
    }

    @Test
    void skipsDatesNotPlannedAsAWorkday() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date))
                .thenReturn(List.of());
        when(effectiveWorkScheduleService.resolve(USER_ID, date)).thenReturn(schedule(date, PlannedStatus.DAY_OFF));

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isZero();
        verify(absenceRecordWriter, never()).createAbsenceIfMissing(any(), any());
    }

    @Test
    void skipsDatesThatAlreadyHaveARecord() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);
        WorkRecord existing = new WorkRecord(USER_ID, date);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date))
                .thenReturn(List.of(existing));

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isZero();
        verify(effectiveWorkScheduleService, never()).resolve(any(), any());
        verify(absenceRecordWriter, never()).createAbsenceIfMissing(any(), any());
    }

    @Test
    void skipsUsersWithNoWorkSettingsForThatYearRatherThanGuessing() throws Exception {
        LocalDate date = LocalDate.now(AppTimeZone.ZONE).minusDays(1);

        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, date, date))
                .thenReturn(List.of());
        when(effectiveWorkScheduleService.resolve(USER_ID, date))
                .thenThrow(new WorkSettingsNotFoundException(USER_ID, date.getYear()));

        int created = newService().backfillForUser(USER_ID, date, date);

        assertThat(created).isZero();
        verify(absenceRecordWriter, never()).createAbsenceIfMissing(any(), any());
    }

    @Test
    void backfillAllUsersNeverQueriesTodayOrAFutureDate() throws Exception {
        LocalDate today = LocalDate.now(AppTimeZone.ZONE);
        LocalDate yesterday = today.minusDays(1);
        LocalDate expectedFrom = today.minusDays(5);

        when(allUserIdsRepository.findAllUserIds()).thenReturn(List.of(USER_ID));
        when(workRecordRepository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, expectedFrom, yesterday))
                .thenReturn(List.of());
        for (LocalDate d = expectedFrom; !d.isAfter(yesterday); d = d.plusDays(1)) {
            when(effectiveWorkScheduleService.resolve(USER_ID, d)).thenReturn(schedule(d, PlannedStatus.DAY_OFF));
        }

        newService().backfillAllUsers();

        verify(workRecordRepository).findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, expectedFrom, yesterday);
        verify(effectiveWorkScheduleService, never()).resolve(USER_ID, today);
    }

    @Test
    void emptyRangeWhenToIsBeforeFromCreatesNothing() throws Exception {
        LocalDate to = LocalDate.now(AppTimeZone.ZONE).minusDays(10);
        LocalDate from = LocalDate.now(AppTimeZone.ZONE).minusDays(1);

        int created = newService().backfillForUser(USER_ID, from, to);

        assertThat(created).isZero();
        verify(workRecordRepository, never()).findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(any(), any(), any());
    }
}
