package com.kafka.backend.workrecord;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.OptimisticLockConflictException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.starttimecriterion.StartTimeCriterion;
import com.kafka.backend.starttimecriterion.StartTimeCriterionRepository;
import com.kafka.backend.worktimeentry.WorkTimeEntryService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkRecordServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final LocalDate WORK_DATE = LocalDate.of(2026, 8, 24);
    private static final LocalDate TODAY = LocalDate.now(com.kafka.backend.common.AppTimeZone.ZONE);

    @Mock
    private WorkRecordRepository repository;

    @Mock
    private StartTimeCriterionRepository criterionRepository;

    @Mock
    private WorkTimeEntryService workTimeEntryService;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private WorkRecordService newService() {
        return new WorkRecordService(repository, criterionRepository, workTimeEntryService, currentUserProvider);
    }

    private static WorkRecordRequest workingRequest(LocalTime clockIn, LocalTime clockOut, UUID criterionId, Integer expectedVersion) {
        return new WorkRecordRequest(WorkAttendanceStatus.WORK, clockIn, clockOut, "카프카 사무실", null, null, criterionId, expectedVersion, null, null);
    }

    @Test
    void createsANewWorkingRecordWhenNoneExists() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord created = newService().upsert(WORK_DATE, workingRequest(LocalTime.of(9, 0), null, null, null));

        assertThat(created.getUserId()).isEqualTo(USER_ID);
        assertThat(created.getWorkDate()).isEqualTo(WORK_DATE);
        assertThat(created.getStatus()).isEqualTo(WorkAttendanceStatus.WORK);
        assertThat(created.getClockInAt()).isNotNull();
    }

    @Test
    void updatesAnOwnedRecordWhenVersionMatches() {
        WorkRecord existing = new WorkRecord(USER_ID, WORK_DATE);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord updated = newService().upsert(WORK_DATE, workingRequest(LocalTime.of(9, 30), null, null, null));

        assertThat(updated.getClockInAt()).isNotNull();
    }

    @Test
    void rejectsUpdateWhenVersionIsStale() {
        WorkRecord existing = mock(WorkRecord.class);
        when(existing.getVersion()).thenReturn(3);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> newService().upsert(WORK_DATE, workingRequest(LocalTime.of(9, 0), null, null, 2)))
                .isInstanceOf(OptimisticLockConflictException.class);
    }

    @Test
    void listInRangeIsScopedToCurrentUser() {
        LocalDate from = LocalDate.of(2026, 8, 1);
        LocalDate to = LocalDate.of(2026, 8, 31);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, from, to)).thenReturn(List.of());

        newService().listInRange(from, to);

        verify(repository).findByUserIdAndWorkDateBetweenOrderByWorkDateAsc(USER_ID, from, to);
    }

    @Test
    void rejectsListWhenToIsBeforeFrom() {
        LocalDate from = LocalDate.of(2026, 8, 31);
        LocalDate to = LocalDate.of(2026, 8, 1);

        assertThatThrownBy(() -> newService().listInRange(from, to))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void findNeverCreatesARecordForAMissingDate() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());

        Optional<WorkRecord> result = newService().find(WORK_DATE);

        assertThat(result).isEmpty();
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsNonWorkingRecordCarryingClockTimes() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.DAY_OFF, LocalTime.of(9, 0), null, null, null, null, null, null, null, null
        );

        assertThatThrownBy(() -> newService().upsert(WORK_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsACriterionOwnedByAnotherUser() {
        UUID foreignCriterionId = UUID.randomUUID();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());
        when(criterionRepository.findByIdAndUserId(foreignCriterionId, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService().upsert(WORK_DATE, workingRequest(LocalTime.of(9, 0), null, foreignCriterionId, null)))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void rejectsNewlyApplyingAnInactiveCriterion() {
        UUID criterionId = UUID.randomUUID();
        StartTimeCriterion inactiveCriterion = mock(StartTimeCriterion.class);
        when(inactiveCriterion.getIsActive()).thenReturn(false);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());
        when(criterionRepository.findByIdAndUserId(criterionId, USER_ID)).thenReturn(Optional.of(inactiveCriterion));

        assertThatThrownBy(() -> newService().upsert(WORK_DATE, workingRequest(LocalTime.of(9, 0), null, criterionId, null)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void snapshotsTheCriterionNameAndStartTimeOnFirstApplication() {
        UUID criterionId = UUID.randomUUID();
        StartTimeCriterion criterion = new StartTimeCriterion(USER_ID, "오후 출근", LocalTime.of(15, 0), 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());
        when(criterionRepository.findByIdAndUserId(criterionId, USER_ID)).thenReturn(Optional.of(criterion));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord created = newService().upsert(WORK_DATE, workingRequest(LocalTime.of(15, 10), null, criterionId, null));

        assertThat(created.getAppliedCriterionName()).isEqualTo("오후 출근");
        assertThat(created.getAppliedStartTime()).isEqualTo(LocalTime.of(15, 0));
    }

    @Test
    void preservesTheExistingSnapshotWhenTheSameCriterionIsResentUnchanged() {
        UUID criterionId = UUID.randomUUID();
        WorkRecord existing = new WorkRecord(USER_ID, WORK_DATE);
        existing.applyChanges(
                WorkAttendanceStatus.WORK, null, null, null, null, null, "old memo",
                criterionId, "오후 출근", LocalTime.of(15, 0), false, null
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // Same criterionId re-sent while only the memo actually changes —
        // the criterion repository must never be consulted, and the frozen
        // snapshot must survive untouched even though the mock criterion
        // repository has no stub for this id at all (proving it's never called).
        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, null, null, null, null, "new memo", criterionId, null, null, null
        );

        WorkRecord updated = newService().upsert(WORK_DATE, request);

        assertThat(updated.getAppliedCriterionName()).isEqualTo("오후 출근");
        assertThat(updated.getAppliedStartTime()).isEqualTo(LocalTime.of(15, 0));
        assertThat(updated.getMemo()).isEqualTo("new memo");
        verify(criterionRepository, never()).findByIdAndUserId(any(), any());
    }

    @Test
    void overnightClockOutBeforeClockInBelongsToTheNextDay() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord created = newService().upsert(WORK_DATE, workingRequest(LocalTime.of(19, 0), LocalTime.of(1, 0), null, null));

        assertThat(created.getClockOutAt().toLocalDate()).isEqualTo(WORK_DATE.plusDays(1));
        assertThat(created.getBasicWorkMinutes()).isEqualTo(6 * 60);
    }

    @Test
    void rejectsEqualClockInAndClockOut() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService().upsert(WORK_DATE, workingRequest(LocalTime.of(9, 0), LocalTime.of(9, 0), null, null)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsClockOutWithoutClockIn() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService().upsert(WORK_DATE, workingRequest(null, LocalTime.of(18, 0), null, null)))
                .isInstanceOf(InvalidRequestException.class);
    }

    // --- Lateness (WorkRecordResponse.from) ---

    @Test
    void exactStartTimeIsNotLate() {
        WorkRecord record = new WorkRecord(USER_ID, WORK_DATE);
        record.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(15, 0)),
                null, null, null, null, null,
                UUID.randomUUID(), "오후 출근", LocalTime.of(15, 0), false, null
        );

        WorkRecordResponse response = WorkRecordResponse.from(record, List.of());

        assertThat(response.latenessMinutes()).isZero();
    }

    @Test
    void laterClockInProducesPositiveLatenessMinutes() {
        WorkRecord record = new WorkRecord(USER_ID, WORK_DATE);
        record.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(15, 10)),
                null, null, null, null, null,
                UUID.randomUUID(), "오후 출근", LocalTime.of(15, 0), false, null
        );

        WorkRecordResponse response = WorkRecordResponse.from(record, List.of());

        assertThat(response.latenessMinutes()).isEqualTo(10);
    }

    @Test
    void noCriterionProducesNotApplicableLateness() {
        WorkRecord record = new WorkRecord(USER_ID, WORK_DATE);
        record.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(9, 0)),
                null, null, null, null, null,
                null, null, null, false, null
        );

        WorkRecordResponse response = WorkRecordResponse.from(record, List.of());

        assertThat(response.latenessMinutes()).isNull();
    }

    // --- On-time override ("정시 출근 처리") ---

    private static WorkRecordRequest workingRequestWithOverride(LocalTime clockIn, UUID criterionId, Integer expectedVersion, Boolean isOnTimeOverride) {
        return new WorkRecordRequest(WorkAttendanceStatus.WORK, clockIn, null, null, null, null, criterionId, expectedVersion, null, isOnTimeOverride);
    }

    @Test
    void appliesOnTimeOverrideWhenGenuinelyLateWithACriterion() {
        UUID criterionId = UUID.randomUUID();
        StartTimeCriterion criterion = new StartTimeCriterion(USER_ID, "오전 출근", LocalTime.of(9, 0), 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());
        when(criterionRepository.findByIdAndUserId(criterionId, USER_ID)).thenReturn(Optional.of(criterion));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord created = newService().upsert(WORK_DATE, workingRequestWithOverride(LocalTime.of(9, 10), criterionId, null, true));

        assertThat(created.isOnTimeOverride()).isTrue();
    }

    @Test
    void appliesOnTimeOverrideWhenTheExistingClockInRoundTrippedThroughPostgresWithADifferentOffsetRepresentation() {
        // Regression test for a bug caught only by real end-to-end browser
        // testing against actual PostgreSQL — invisible to every mock-based
        // test, since a mock never round-trips a value through a real
        // TIMESTAMPTZ column. Two independent issues, both fixed by
        // WorkRecordService.toComparableMinute:
        //   1. TIMESTAMPTZ does not store an offset — Postgres/the JDBC
        //      driver returns an existing row's clock-in normalized to a UTC
        //      ("Z") offset, while a freshly computed value from the current
        //      request uses AppTimeZone's own +09:00. Same instant, but
        //      OffsetDateTime.equals() (unlike isEqual()) also compares the
        //      offset itself, so every resend of an *unchanged* clock-in
        //      looked like a change on the very next save after a real
        //      round-trip — the override could never actually be applied.
        //   2. The dedicated clock-in action stamps full second/nanosecond
        //      precision, but every clock time the client can ever resend
        //      through the generic upsert is "HH:MM" only, so a
        //      reconstruction from that string is always exactly zero-second.
        UUID criterionId = UUID.randomUUID();
        WorkRecord existing = new WorkRecord(USER_ID, WORK_DATE);
        // Same real instant as WORK_DATE 09:10 KST, but deliberately
        // represented with a UTC offset and non-zero seconds/nanos — exactly
        // what a real clock-in, read back from a TIMESTAMPTZ column, looks
        // like by the time it reaches this comparison.
        java.time.OffsetDateTime existingClockInAt = com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(9, 10))
                .withOffsetSameInstant(java.time.ZoneOffset.UTC)
                .plusSeconds(37)
                .plusNanos(123_000_000);
        existing.applyChanges(
                WorkAttendanceStatus.WORK,
                existingClockInAt,
                null, null, null, null, null,
                criterionId, "오전 출근", LocalTime.of(9, 0), false, null
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord updated = newService().upsert(WORK_DATE, workingRequestWithOverride(LocalTime.of(9, 10), criterionId, null, true));

        assertThat(updated.isOnTimeOverride()).isTrue();
    }

    @Test
    void rejectsOnTimeOverrideWhenNotActuallyLate() {
        UUID criterionId = UUID.randomUUID();
        StartTimeCriterion criterion = new StartTimeCriterion(USER_ID, "오전 출근", LocalTime.of(9, 0), 0);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());
        when(criterionRepository.findByIdAndUserId(criterionId, USER_ID)).thenReturn(Optional.of(criterion));

        assertThatThrownBy(() -> newService().upsert(WORK_DATE, workingRequestWithOverride(LocalTime.of(9, 0), criterionId, null, true)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsOnTimeOverrideWithoutAnAppliedCriterion() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService().upsert(WORK_DATE, workingRequestWithOverride(LocalTime.of(9, 10), null, null, true)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void invalidatesOnTimeOverrideWhenClockInChanges() {
        UUID criterionId = UUID.randomUUID();
        WorkRecord existing = new WorkRecord(USER_ID, WORK_DATE);
        existing.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(9, 10)),
                null, null, null, null, null,
                criterionId, "오전 출근", LocalTime.of(9, 0), true, null
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // Same criterion re-sent, but clockIn actually moves — the previous
        // override must not silently survive a materially different time.
        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, LocalTime.of(9, 20), null, null, null, null, criterionId, null, null, true
        );

        WorkRecord updated = newService().upsert(WORK_DATE, request);

        assertThat(updated.isOnTimeOverride()).isFalse();
    }

    @Test
    void invalidatesOnTimeOverrideWhenLeavingWorkdayStatus() {
        UUID criterionId = UUID.randomUUID();
        WorkRecord existing = new WorkRecord(USER_ID, WORK_DATE);
        existing.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(9, 10)),
                null, null, null, null, null,
                criterionId, "오전 출근", LocalTime.of(9, 0), true, null
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.DAY_OFF, null, null, null, null, null, null, null, null, null
        );

        WorkRecord updated = newService().upsert(WORK_DATE, request);

        assertThat(updated.isOnTimeOverride()).isFalse();
    }

    // --- Dedicated clock-in / clock-out / clear actions ---

    @Test
    void clockInStampsTheCurrentTimeWhenEligible() {
        WorkRecord existing = new WorkRecord(USER_ID, TODAY);
        existing.applyChanges(
                WorkAttendanceStatus.WORK, null, null, null, null, null, null,
                UUID.randomUUID(), "오전 출근", LocalTime.of(9, 0), false, null
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, TODAY)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord result = newService().clockIn(TODAY, new WorkRecordActionRequest(null));

        assertThat(result.getClockInAt()).isNotNull();
    }

    @Test
    void clockInRejectsWhenNoCriterionApplied() {
        WorkRecord existing = new WorkRecord(USER_ID, TODAY);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, TODAY)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> newService().clockIn(TODAY, new WorkRecordActionRequest(null)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void clockInRejectsWhenAlreadyClockedIn() {
        WorkRecord existing = new WorkRecord(USER_ID, TODAY);
        existing.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(TODAY.atTime(9, 0)),
                null, null, null, null, null,
                UUID.randomUUID(), "오전 출근", LocalTime.of(9, 0), false, null
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, TODAY)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> newService().clockIn(TODAY, new WorkRecordActionRequest(null)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void clockInRejectsForANonTodayDate() {
        assertThatThrownBy(() -> newService().clockIn(WORK_DATE, new WorkRecordActionRequest(null)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void clockInRejectsWhenNoRecordExists() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, TODAY)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService().clockIn(TODAY, new WorkRecordActionRequest(null)))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void clockInRejectsStaleVersion() {
        WorkRecord existing = mock(WorkRecord.class);
        when(existing.getVersion()).thenReturn(3);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, TODAY)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> newService().clockIn(TODAY, new WorkRecordActionRequest(1)))
                .isInstanceOf(OptimisticLockConflictException.class);
    }

    @Test
    void clockOutComputesDurationFromExistingClockIn() {
        WorkRecord existing = new WorkRecord(USER_ID, TODAY);
        existing.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(TODAY.atTime(9, 0)),
                null, null, null, null, null,
                UUID.randomUUID(), "오전 출근", LocalTime.of(9, 0), false, null
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, TODAY)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord result = newService().clockOut(TODAY, new WorkRecordActionRequest(null));

        assertThat(result.getClockOutAt()).isNotNull();
        assertThat(result.getBasicWorkMinutes()).isNotNull();
    }

    @Test
    void clockOutRejectsWithoutAPriorClockIn() {
        WorkRecord existing = new WorkRecord(USER_ID, TODAY);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, TODAY)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> newService().clockOut(TODAY, new WorkRecordActionRequest(null)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void clearClockTimesResetsClockFieldsAndOverride() {
        WorkRecord existing = new WorkRecord(USER_ID, WORK_DATE);
        existing.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(9, 10)),
                com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(18, 0)),
                530, null, null, null,
                UUID.randomUUID(), "오전 출근", LocalTime.of(9, 0), true, null
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(existing));
        when(workTimeEntryService.findByWorkRecord(existing.getId())).thenReturn(List.of());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord result = newService().clearClockTimes(WORK_DATE, new WorkRecordActionRequest(null));

        assertThat(result.getClockInAt()).isNull();
        assertThat(result.getClockOutAt()).isNull();
        assertThat(result.getBasicWorkMinutes()).isNull();
        assertThat(result.isOnTimeOverride()).isFalse();
    }

    @Test
    void clearClockTimesBlockedWhileWorkTimeEntriesExist() {
        WorkRecord existing = new WorkRecord(USER_ID, WORK_DATE);
        existing.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(9, 10)),
                null, null, null, null, null, null, null, null, false, null
        );
        com.kafka.backend.worktimeentry.WorkTimeEntry entry = mock(com.kafka.backend.worktimeentry.WorkTimeEntry.class);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(existing));
        when(workTimeEntryService.findByWorkRecord(existing.getId())).thenReturn(List.of(entry));

        assertThatThrownBy(() -> newService().clearClockTimes(WORK_DATE, new WorkRecordActionRequest(null)))
                .isInstanceOf(InvalidRequestException.class);
    }

    // --- Absence correction (결근 정정) ---

    @Test
    void correctsAnAbsenceRecordAndStampsCorrectedAt() {
        WorkRecord absence = WorkRecord.createAbsence(USER_ID, WORK_DATE);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(absence));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, LocalTime.of(9, 0), null, null, null, "실제로는 출근함", null, null, null, null
        );

        WorkRecord corrected = newService().correctAbsence(WORK_DATE, request);

        assertThat(corrected.getStatus()).isEqualTo(WorkAttendanceStatus.WORK);
        assertThat(corrected.getAbsenceCorrectedAt()).isNotNull();
        assertThat(corrected.isAbsenceAutoGenerated()).isTrue();
    }

    @Test
    void rejectsCorrectingARecordThatIsNotCurrentlyAbsent() {
        WorkRecord workingRecord = new WorkRecord(USER_ID, WORK_DATE);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(workingRecord));

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, null, null, null, null, null, null, 0, null, null
        );

        assertThatThrownBy(() -> newService().correctAbsence(WORK_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsCorrectingWhenNoRecordExistsAtAll() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, null, null, null, null, null, null, 0, null, null
        );

        assertThatThrownBy(() -> newService().correctAbsence(WORK_DATE, request))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void repeatedCorrectionOfAnAlreadyCorrectedNonAbsentRecordIsRejectedNotSilentlyReapplied() {
        // Once corrected away from ABSENT, the record is no longer eligible
        // through this endpoint — a further edit is an ordinary upsert.
        WorkRecord alreadyCorrected = new WorkRecord(USER_ID, WORK_DATE);
        alreadyCorrected.applyChanges(
                WorkAttendanceStatus.WORK, null, null, null, null, null, null,
                null, null, null, false, java.time.OffsetDateTime.now()
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(alreadyCorrected));

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, null, null, null, null, "again", null, 0, null, null
        );

        assertThatThrownBy(() -> newService().correctAbsence(WORK_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void plainUpsertPreservesAnExistingCorrectionTimestamp() {
        java.time.OffsetDateTime correctedAt = java.time.OffsetDateTime.now();
        WorkRecord alreadyCorrected = new WorkRecord(USER_ID, WORK_DATE);
        alreadyCorrected.applyChanges(
                WorkAttendanceStatus.WORK, null, null, null, null, null, "old memo",
                null, null, null, false, correctedAt
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(alreadyCorrected));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, null, null, null, null, "new memo", null, null, null, null
        );

        WorkRecord updated = newService().upsert(WORK_DATE, request);

        assertThat(updated.getAbsenceCorrectedAt()).isEqualTo(correctedAt);
        assertThat(updated.getMemo()).isEqualTo("new memo");
    }

    @Test
    void freshRecordCreatedByPlainUpsertHasNoCorrectionTimestamp() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord created = newService().upsert(WORK_DATE, workingRequest(LocalTime.of(9, 0), null, null, null));

        assertThat(created.getAbsenceCorrectedAt()).isNull();
    }

    // --- Explicit ownership / IDOR coverage ---
    // WorkRecord has no id-based lookup at all (only date, always paired
    // with CurrentUserProvider's own user id) — these lock in that every
    // repository call is scoped to the resolved current user, never any
    // other id, across every entry point.

    @Test
    void findIsScopedToTheCurrentUserOnly() {
        UUID otherUserId = UUID.randomUUID();
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());

        newService().find(WORK_DATE);

        verify(repository).findByUserIdAndWorkDate(USER_ID, WORK_DATE);
        verify(repository, never()).findByUserIdAndWorkDate(otherUserId, WORK_DATE);
    }

    @Test
    void upsertNeverPersistsARecordUnderAnotherUsersId() {
        UUID otherUserId = UUID.randomUUID();
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        WorkRecord created = newService().upsert(WORK_DATE, workingRequest(LocalTime.of(9, 0), null, null, null));

        assertThat(created.getUserId()).isEqualTo(USER_ID);
        assertThat(created.getUserId()).isNotEqualTo(otherUserId);
        verify(repository, never()).findByUserIdAndWorkDate(otherUserId, WORK_DATE);
    }

    @Test
    void clockActionsNeverOperateOnAnotherUsersRecord() {
        UUID otherUserId = UUID.randomUUID();
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, TODAY)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> newService().clockIn(TODAY, new WorkRecordActionRequest(null)))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(repository, never()).findByUserIdAndWorkDate(otherUserId, TODAY);
    }
}
