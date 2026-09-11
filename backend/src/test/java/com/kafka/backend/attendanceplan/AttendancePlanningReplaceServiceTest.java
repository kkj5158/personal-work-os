package com.kafka.backend.attendanceplan;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.plannedtimeblock.PlanDomainType;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlock;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRepository;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRequest;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockService;
import com.kafka.backend.workrecord.WorkAttendanceStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * P1-C: AttendancePlanningReplaceService's own direct dependencies
 * (AttendancePlanService, PlannedTimeBlockService) are mocked here — their
 * own validation/persistence behavior is already covered by
 * AttendancePlanServiceTest and PlannedTimeBlockService's own tests. These
 * tests verify the ORCHESTRATION this new service adds: plan-optional
 * upsert-or-preserve, delete-then-recreate-blocks sequencing, and that a
 * failure partway through propagates (so the surrounding @Transactional
 * boundary — a Mockito unit test cannot itself exercise a real DB rollback —
 * actually gets the exception it needs to roll back on). WorkRecord is never
 * imported or referenced anywhere in AttendancePlanningReplaceService; there
 * is no WorkRecord dependency to mock in the first place.
 */
@ExtendWith(MockitoExtension.class)
class AttendancePlanningReplaceServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final LocalDate TODAY = LocalDate.now(AppTimeZone.ZONE);
    private static final LocalDate FUTURE_DATE = TODAY.plusDays(7);

    @Mock
    private AttendancePlanService attendancePlanService;

    @Mock
    private PlannedTimeBlockService plannedTimeBlockService;

    @Mock
    private PlannedTimeBlockRepository plannedTimeBlockRepository;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private AttendancePlanningReplaceService newService() {
        return new AttendancePlanningReplaceService(attendancePlanService, plannedTimeBlockService, plannedTimeBlockRepository, currentUserProvider);
    }

    @Test
    void rejectsAnAlreadyElapsedDateWithoutTouchingAnythingElse() {
        AttendancePlanningReplaceService service = newService();
        AttendancePlanningReplaceRequest request = new AttendancePlanningReplaceRequest(null, List.of());

        assertThatThrownBy(() -> service.replace(TODAY.minusDays(1), request))
                .isInstanceOf(InvalidRequestException.class);

        verifyNoInteractions(attendancePlanService, plannedTimeBlockService, plannedTimeBlockRepository);
    }

    @Test
    void rejectsANullBlocksListRatherThanTreatingItAsEmpty() {
        AttendancePlanningReplaceService service = newService();
        AttendancePlanningReplaceRequest request = new AttendancePlanningReplaceRequest(null, null);

        assertThatThrownBy(() -> service.replace(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);

        verifyNoInteractions(attendancePlanService, plannedTimeBlockService, plannedTimeBlockRepository);
    }

    @Test
    void planAndMultipleBlocksReplacesOldPlanningStateCompletely() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        AttendancePlanRequest planRequest = new AttendancePlanRequest(WorkAttendanceStatus.WORK, UUID.randomUUID(), 420);
        AttendancePlan savedPlan = new AttendancePlan(USER_ID, FUTURE_DATE);
        when(attendancePlanService.upsert(FUTURE_DATE, planRequest)).thenReturn(savedPlan);

        PlannedTimeBlock oldBlock = newBlock("stale", FUTURE_DATE, 9, 10);
        when(plannedTimeBlockRepository.findOverlapping(any(), any(), any())).thenReturn(List.of(oldBlock));

        PlannedTimeBlockRequest req1 = fakeBlockRequest(FUTURE_DATE, 15, 17);
        PlannedTimeBlockRequest req2 = fakeBlockRequest(FUTURE_DATE, 18, 20);
        PlannedTimeBlock created1 = newBlock("a", FUTURE_DATE, 15, 17);
        PlannedTimeBlock created2 = newBlock("b", FUTURE_DATE, 18, 20);
        when(plannedTimeBlockService.create(any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(created1, created2);

        AttendancePlanningReplaceRequest request = new AttendancePlanningReplaceRequest(planRequest, List.of(req1, req2));
        AttendancePlanningReplaceResult result = newService().replace(FUTURE_DATE, request);

        verify(plannedTimeBlockRepository).deleteAll(List.of(oldBlock));
        verify(plannedTimeBlockService, times(2)).create(any(), any(), any(), any(), any(), any(), any(), any());
        assertThat(result.plan()).isSameAs(savedPlan);
        assertThat(result.blocks()).containsExactly(created1, created2);
    }

    @Test
    void nullPlanPreservesWhateverPlanAlreadyExistsWithoutCallingUpsert() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        AttendancePlan existingPlan = new AttendancePlan(USER_ID, FUTURE_DATE);
        when(attendancePlanService.find(FUTURE_DATE)).thenReturn(Optional.of(existingPlan));
        when(plannedTimeBlockRepository.findOverlapping(any(), any(), any())).thenReturn(List.of());

        AttendancePlanningReplaceRequest request = new AttendancePlanningReplaceRequest(null, List.of());
        AttendancePlanningReplaceResult result = newService().replace(FUTURE_DATE, request);

        verify(attendancePlanService, never()).upsert(any(), any());
        assertThat(result.plan()).isSameAs(existingPlan);
    }

    @Test
    void emptyBlockListDeletesExistingBlocksAndCreatesNone() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(attendancePlanService.find(FUTURE_DATE)).thenReturn(Optional.empty());
        PlannedTimeBlock oldBlock = newBlock("stale", FUTURE_DATE, 9, 10);
        when(plannedTimeBlockRepository.findOverlapping(any(), any(), any())).thenReturn(List.of(oldBlock));

        AttendancePlanningReplaceRequest request = new AttendancePlanningReplaceRequest(null, List.of());
        AttendancePlanningReplaceResult result = newService().replace(FUTURE_DATE, request);

        verify(plannedTimeBlockRepository).deleteAll(List.of(oldBlock));
        verify(plannedTimeBlockService, never()).create(any(), any(), any(), any(), any(), any(), any(), any());
        assertThat(result.plan()).isNull();
        assertThat(result.blocks()).isEmpty();
    }

    @Test
    void blockOnlyOldTargetIsReplacedWithoutTouchingPlan() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(attendancePlanService.find(FUTURE_DATE)).thenReturn(Optional.empty());
        PlannedTimeBlock oldBlock = newBlock("stale", FUTURE_DATE, 9, 10);
        when(plannedTimeBlockRepository.findOverlapping(any(), any(), any())).thenReturn(List.of(oldBlock));
        PlannedTimeBlockRequest newBlockReq = fakeBlockRequest(FUTURE_DATE, 15, 17);
        PlannedTimeBlock newBlock = newBlock("new", FUTURE_DATE, 15, 17);
        when(plannedTimeBlockService.create(any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(newBlock);

        AttendancePlanningReplaceRequest request = new AttendancePlanningReplaceRequest(null, List.of(newBlockReq));
        AttendancePlanningReplaceResult result = newService().replace(FUTURE_DATE, request);

        verify(attendancePlanService, never()).upsert(any(), any());
        verify(plannedTimeBlockRepository).deleteAll(List.of(oldBlock));
        assertThat(result.plan()).isNull();
        assertThat(result.blocks()).containsExactly(newBlock);
    }

    @Test
    void aFailureCreatingALaterBlockPropagatesSoTheSurroundingTransactionRollsBack() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(attendancePlanService.find(FUTURE_DATE)).thenReturn(Optional.empty());
        when(plannedTimeBlockRepository.findOverlapping(any(), any(), any())).thenReturn(List.of());
        PlannedTimeBlockRequest ok = fakeBlockRequest(FUTURE_DATE, 9, 10);
        PlannedTimeBlockRequest invalid = fakeBlockRequest(FUTURE_DATE, 9, 11);
        PlannedTimeBlock createdOk = newBlock("ok", FUTURE_DATE, 9, 10);
        when(plannedTimeBlockService.create(any(), any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(createdOk)
                .thenThrow(new InvalidRequestException("Some later validation failure"));

        AttendancePlanningReplaceRequest request = new AttendancePlanningReplaceRequest(null, List.of(ok, invalid));

        // The method must not swallow this — @Transactional relies on the
        // exception propagating out of the proxied method to trigger
        // rollback of everything (the delete + the one block already
        // created in this same call) for this target.
        assertThatThrownBy(() -> newService().replace(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    private static PlannedTimeBlockRequest fakeBlockRequest(LocalDate date, int startHour, int endHour) {
        return new PlannedTimeBlockRequest(
                PlanDomainType.WORK,
                "block",
                LocalDateTime.of(date, java.time.LocalTime.of(startHour, 0)),
                LocalDateTime.of(date, java.time.LocalTime.of(endHour, 0)),
                null,
                null,
                null,
                null
        );
    }

    private static PlannedTimeBlock newBlock(String title, LocalDate date, int startHour, int endHour) {
        return new PlannedTimeBlock(
                USER_ID, PlanDomainType.WORK, title, stored(date, startHour), stored(date, endHour), null, null, null, null
        );
    }

    private static OffsetDateTime stored(LocalDate date, int hour) {
        return AppTimeZone.toStored(LocalDateTime.of(date, java.time.LocalTime.of(hour, 0)));
    }
}
