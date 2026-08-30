package com.kafka.backend.attendanceplan;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.leaveallowance.LeaveAllowanceService;
import com.kafka.backend.starttimecriterion.StartTimeCriterion;
import com.kafka.backend.starttimecriterion.StartTimeCriterionRepository;
import com.kafka.backend.workrecord.WorkAttendanceStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AttendancePlanServiceTest {

    private static final UUID USER_ID = UUID.randomUUID();
    private static final LocalDate TODAY = LocalDate.now(AppTimeZone.ZONE);
    private static final LocalDate FUTURE_DATE = TODAY.plusDays(7);

    @Mock
    private AttendancePlanRepository repository;

    @Mock
    private StartTimeCriterionRepository criterionRepository;

    @Mock
    private LeaveAllowanceService leaveAllowanceService;

    @Mock
    private CurrentUserProvider currentUserProvider;

    private AttendancePlanService newService() {
        return new AttendancePlanService(repository, criterionRepository, leaveAllowanceService, currentUserProvider);
    }

    private static StartTimeCriterion activeCriterion() {
        return new StartTimeCriterion(USER_ID, "오후 출근", LocalTime.of(15, 0), 0, 0, null);
    }

    @Test
    void rejectsAPlanForAnAlreadyElapsedDate() {
        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.PAID_LEAVE, null, null);

        assertThatThrownBy(() -> service.upsert(TODAY.minusDays(1), request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsANonPlannableStatus() {
        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.SICK_LEAVE, null, null);

        assertThatThrownBy(() -> service.upsert(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsEarlyLeaveAsAPlanStatus() {
        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.EARLY_LEAVE, null, null);

        assertThatThrownBy(() -> service.upsert(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAbsentAsAPlanStatus() {
        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.ABSENT, null, null);

        assertThatThrownBy(() -> service.upsert(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void workPlanRequiresAStartTimeCriterion() {
        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.WORK, null, null);

        assertThatThrownBy(() -> service.upsert(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void halfDayPlanRequiresAStartTimeCriterion() {
        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.HALF_DAY, null, null);

        assertThatThrownBy(() -> service.upsert(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void annualLeavePlanDoesNotRequireAStartTimeCriterion() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AttendancePlan saved = newService().upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.PAID_LEAVE, null, null));

        assertThat(saved.getPlannedStatus()).isEqualTo(WorkAttendanceStatus.PAID_LEAVE);
        assertThat(saved.getStartTimeCriterionId()).isNull();
        verify(criterionRepository, never()).findByIdAndUserId(any(), any());
    }

    @Test
    void holidayPlanDoesNotRequireAStartTimeCriterion() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AttendancePlan saved = newService().upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.DAY_OFF, null, null));

        assertThat(saved.getPlannedStatus()).isEqualTo(WorkAttendanceStatus.DAY_OFF);
        assertThat(saved.getStartTimeCriterionId()).isNull();
    }

    @Test
    void workPlanWithAValidCriterionIsAccepted() {
        StartTimeCriterion criterion = activeCriterion();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(criterionRepository.findByIdAndUserId(criterion.getId(), USER_ID)).thenReturn(Optional.of(criterion));
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AttendancePlan saved = newService().upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.WORK, criterion.getId(), null));

        assertThat(saved.getStartTimeCriterionId()).isEqualTo(criterion.getId());
    }

    @Test
    void rejectsAnInactiveCriterionForANewWorkPlan() {
        StartTimeCriterion inactive = activeCriterion();
        inactive.update(inactive.getName(), inactive.getStartTime(), false, null, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(criterionRepository.findByIdAndUserId(inactive.getId(), USER_ID)).thenReturn(Optional.of(inactive));

        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.WORK, inactive.getId(), null);

        assertThatThrownBy(() -> service.upsert(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAnArchivedCriterionForANewWorkPlan() {
        StartTimeCriterion archived = activeCriterion();
        archived.archive(java.time.OffsetDateTime.now());

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(criterionRepository.findByIdAndUserId(archived.getId(), USER_ID)).thenReturn(Optional.of(archived));

        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.WORK, archived.getId(), null);

        assertThatThrownBy(() -> service.upsert(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAForeignOwnedCriterion() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(criterionRepository.findByIdAndUserId(any(), any())).thenReturn(Optional.empty());

        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.WORK, UUID.randomUUID(), null);

        assertThatThrownBy(() -> service.upsert(FUTURE_DATE, request))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void leaveConsumingPlansAreValidatedAgainstTheMonthlyBalance() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);

        AttendancePlanService service = newService();
        service.upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.PAID_LEAVE, null, null));
        // No stub for repository.save() needed to observe the interaction —
        // requireSufficientBalance is void and would throw before save() if
        // rejected; this test only needs to confirm the call happens.

        verify(leaveAllowanceService).requireSufficientBalance(USER_ID, FUTURE_DATE, WorkAttendanceStatus.PAID_LEAVE);
    }

    @Test
    void updatingAnExistingPlanReusesTheSameRow() {
        AttendancePlan existing = new AttendancePlan(USER_ID, FUTURE_DATE);
        existing.update(WorkAttendanceStatus.DAY_OFF, null, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AttendancePlan saved = newService().upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.PAID_LEAVE, null, null));

        assertThat(saved.getId()).isEqualTo(existing.getId());
        assertThat(saved.getPlannedStatus()).isEqualTo(WorkAttendanceStatus.PAID_LEAVE);
    }

    @Test
    void deletingAPlanForAnAlreadyElapsedDateIsRejected() {
        AttendancePlanService service = newService();

        assertThatThrownBy(() -> service.delete(TODAY.minusDays(1)))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void deletingAnExistingFuturePlanRemovesIt() {
        AttendancePlan existing = new AttendancePlan(USER_ID, FUTURE_DATE);
        existing.update(WorkAttendanceStatus.DAY_OFF, null, null);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.of(existing));

        newService().delete(FUTURE_DATE);

        verify(repository).delete(existing);
    }

    @Test
    void deletingANonExistentPlanIsANoOp() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.empty());

        newService().delete(FUTURE_DATE);

        verify(repository, never()).delete(any(AttendancePlan.class));
    }

    // --- plannedNetWorkMinutes (attendance follow-up QA round 2, §5-7/§26) ---

    @Test
    void savesAnOptionalPlannedNetWorkMinutesAlongsideAWorkPlan() {
        StartTimeCriterion criterion = activeCriterion();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(criterionRepository.findByIdAndUserId(criterion.getId(), USER_ID)).thenReturn(Optional.of(criterion));
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AttendancePlan saved = newService().upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.WORK, criterion.getId(), 360));

        assertThat(saved.getPlannedNetWorkMinutes()).isEqualTo(360);
    }

    @Test
    void plannedNetWorkMinutesDefaultsToNullNeverConflatedWithZero() {
        StartTimeCriterion criterion = activeCriterion();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(criterionRepository.findByIdAndUserId(criterion.getId(), USER_ID)).thenReturn(Optional.of(criterion));
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AttendancePlan saved = newService().upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.WORK, criterion.getId(), null));

        assertThat(saved.getPlannedNetWorkMinutes()).isNull();
    }

    @Test
    void rejectsANegativePlannedNetWorkMinutes() {
        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.PAID_LEAVE, null, -1);

        assertThatThrownBy(() -> service.upsert(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void rejectsAPlannedNetWorkMinutesAboveOneDay() {
        AttendancePlanService service = newService();
        AttendancePlanRequest request = new AttendancePlanRequest(WorkAttendanceStatus.PAID_LEAVE, null, 1441);

        assertThatThrownBy(() -> service.upsert(FUTURE_DATE, request))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void acceptsTheMaximumPlannedNetWorkMinutes() {
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AttendancePlan saved = newService().upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.PAID_LEAVE, null, 1440));

        assertThat(saved.getPlannedNetWorkMinutes()).isEqualTo(1440);
    }

    @Test
    void plannedNetWorkMinutesIsAcceptedEvenForANonWorkStatus() {
        // Dormant-preservation policy (§8-11): the service never rejects or
        // nulls out plannedNetWorkMinutes based on plannedStatus — a caller
        // (the frontend) is responsible for resending a previously-dormant
        // value when saving a non-work status specifically so it survives.
        // This test locks in that the SERVICE ITSELF imposes no such
        // status-based restriction.
        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AttendancePlan saved = newService().upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.PAID_LEAVE, null, 360));

        assertThat(saved.getPlannedNetWorkMinutes()).isEqualTo(360);
    }

    @Test
    void savingWithoutPlannedNetWorkMinutesClearsAPreviouslyStoredValue() {
        // update() always writes exactly what it's given — this is the
        // "dormant round-trip" contract at the entity level: a caller that
        // wants to keep a previous value MUST resend it; omitting it (null)
        // is a genuine clear, not "leave unchanged". §26: "changing
        // PlannedTimeBlocks does NOT silently rewrite plannedNetWorkMinutes"
        // is a separate, already-true fact (this service never touches
        // PlannedTimeBlock at all) — this test instead locks in the
        // AttendancePlan-side half of that contract: only an explicit
        // resend preserves the value, nothing implicit does.
        AttendancePlan existing = new AttendancePlan(USER_ID, FUTURE_DATE);
        existing.update(WorkAttendanceStatus.WORK, UUID.randomUUID(), 300);
        StartTimeCriterion criterion = activeCriterion();

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(criterionRepository.findByIdAndUserId(criterion.getId(), USER_ID)).thenReturn(Optional.of(criterion));
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AttendancePlan saved = newService().upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.WORK, criterion.getId(), null));

        assertThat(saved.getPlannedNetWorkMinutes()).isNull();
    }

    @Test
    void resendingTheSameDormantPlannedNetWorkMinutesPreservesItAcrossANonWorkStatusSave() {
        // The end-to-end dormant round-trip: a plan currently WORK with a
        // configured target is saved again as PAID_LEAVE while resending the
        // same plannedNetWorkMinutes (exactly what the frontend's draft-based
        // save flow does) — the value survives verbatim even though the new
        // status doesn't require a criterion and wouldn't normally surface
        // this field in the UI.
        AttendancePlan existing = new AttendancePlan(USER_ID, FUTURE_DATE);
        existing.update(WorkAttendanceStatus.WORK, UUID.randomUUID(), 360);

        when(currentUserProvider.getCurrentUserId()).thenReturn(USER_ID);
        when(repository.findByUserIdAndPlanDate(USER_ID, FUTURE_DATE)).thenReturn(Optional.of(existing));
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AttendancePlan saved = newService().upsert(FUTURE_DATE, new AttendancePlanRequest(WorkAttendanceStatus.PAID_LEAVE, null, 360));

        assertThat(saved.getPlannedStatus()).isEqualTo(WorkAttendanceStatus.PAID_LEAVE);
        assertThat(saved.getStartTimeCriterionId()).isNull();
        assertThat(saved.getPlannedNetWorkMinutes()).isEqualTo(360);
    }
}
