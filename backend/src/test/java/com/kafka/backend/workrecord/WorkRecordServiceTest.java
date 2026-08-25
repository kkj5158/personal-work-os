package com.kafka.backend.workrecord;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.OptimisticLockConflictException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.starttimecriterion.StartTimeCriterion;
import com.kafka.backend.starttimecriterion.StartTimeCriterionRepository;
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

    @Mock
    private WorkRecordRepository repository;

    @Mock
    private StartTimeCriterionRepository criterionRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private WorkRecordService newService() {
        return new WorkRecordService(repository, criterionRepository, currentUserProvider);
    }

    private static WorkRecordRequest workingRequest(LocalTime clockIn, LocalTime clockOut, UUID criterionId, Integer expectedVersion) {
        return new WorkRecordRequest(WorkAttendanceStatus.WORK, clockIn, clockOut, "카프카 사무실", null, null, criterionId, expectedVersion);
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

        WorkRecord updated = newService().upsert(WORK_DATE, workingRequest(LocalTime.of(9, 30), null, null, 0));

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
                WorkAttendanceStatus.DAY_OFF, LocalTime.of(9, 0), null, null, null, null, null, null
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
                criterionId, "오후 출근", LocalTime.of(15, 0)
        );

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndWorkDate(USER_ID, WORK_DATE)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // Same criterionId re-sent while only the memo actually changes —
        // the criterion repository must never be consulted, and the frozen
        // snapshot must survive untouched even though the mock criterion
        // repository has no stub for this id at all (proving it's never called).
        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, null, null, null, null, "new memo", criterionId, 0
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
                UUID.randomUUID(), "오후 출근", LocalTime.of(15, 0)
        );

        WorkRecordResponse response = WorkRecordResponse.from(record);

        assertThat(response.latenessMinutes()).isZero();
    }

    @Test
    void laterClockInProducesPositiveLatenessMinutes() {
        WorkRecord record = new WorkRecord(USER_ID, WORK_DATE);
        record.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(15, 10)),
                null, null, null, null, null,
                UUID.randomUUID(), "오후 출근", LocalTime.of(15, 0)
        );

        WorkRecordResponse response = WorkRecordResponse.from(record);

        assertThat(response.latenessMinutes()).isEqualTo(10);
    }

    @Test
    void noCriterionProducesNotApplicableLateness() {
        WorkRecord record = new WorkRecord(USER_ID, WORK_DATE);
        record.applyChanges(
                WorkAttendanceStatus.WORK,
                com.kafka.backend.common.AppTimeZone.toStored(WORK_DATE.atTime(9, 0)),
                null, null, null, null, null,
                null, null, null
        );

        WorkRecordResponse response = WorkRecordResponse.from(record);

        assertThat(response.latenessMinutes()).isNull();
    }
}
