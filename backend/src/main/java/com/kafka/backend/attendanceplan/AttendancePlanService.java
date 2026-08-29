package com.kafka.backend.attendanceplan;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.leaveallowance.LeaveAllowanceService;
import com.kafka.backend.starttimecriterion.StartTimeCriterion;
import com.kafka.backend.starttimecriterion.StartTimeCriterionRepository;
import com.kafka.backend.workrecord.WorkAttendanceStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Future planned attendance — a separate domain from the actual
 * {@link com.kafka.backend.workrecord.WorkRecord}. See
 * docs/product/work-attendance-management-design.md for the full
 * plan-vs-actual policy.
 */
@Service
public class AttendancePlanService {

    /**
     * SICK_LEAVE/EARLY_LEAVE/ABSENT are actual/unplanned-only outcomes and
     * are never valid plan statuses — see docs/product/work-attendance-management-design.md.
     */
    private static final Set<WorkAttendanceStatus> PLANNABLE_STATUSES =
            EnumSet.of(WorkAttendanceStatus.WORK, WorkAttendanceStatus.HALF_DAY, WorkAttendanceStatus.PAID_LEAVE, WorkAttendanceStatus.DAY_OFF);

    private static final Set<WorkAttendanceStatus> CRITERION_REQUIRED_STATUSES =
            EnumSet.of(WorkAttendanceStatus.WORK, WorkAttendanceStatus.HALF_DAY);

    private final AttendancePlanRepository repository;
    private final StartTimeCriterionRepository criterionRepository;
    private final LeaveAllowanceService leaveAllowanceService;
    private final CurrentUserProvider currentUserProvider;

    public AttendancePlanService(
            AttendancePlanRepository repository,
            StartTimeCriterionRepository criterionRepository,
            LeaveAllowanceService leaveAllowanceService,
            CurrentUserProvider currentUserProvider
    ) {
        this.repository = repository;
        this.criterionRepository = criterionRepository;
        this.leaveAllowanceService = leaveAllowanceService;
        this.currentUserProvider = currentUserProvider;
    }

    public List<AttendancePlan> listInRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new InvalidRequestException("to must not be before from");
        }
        return repository.findByUserIdAndPlanDateBetweenOrderByPlanDateAsc(currentUserProvider.getCurrentUserId(), from, to);
    }

    public Optional<AttendancePlan> find(LocalDate planDate) {
        return repository.findByUserIdAndPlanDate(currentUserProvider.getCurrentUserId(), planDate);
    }

    @Transactional
    public AttendancePlan upsert(LocalDate planDate, AttendancePlanRequest request) {
        if (planDate == null) {
            throw new InvalidRequestException("planDate is required");
        }
        if (planDate.isBefore(LocalDate.now(AppTimeZone.ZONE))) {
            throw new InvalidRequestException("A plan cannot be created or edited for a date that has already elapsed");
        }
        if (request.plannedStatus() == null || !PLANNABLE_STATUSES.contains(request.plannedStatus())) {
            throw new InvalidRequestException("plannedStatus must be one of " + PLANNABLE_STATUSES);
        }

        UUID userId = currentUserProvider.getCurrentUserId();
        UUID resolvedCriterionId = null;

        if (CRITERION_REQUIRED_STATUSES.contains(request.plannedStatus())) {
            if (request.startTimeCriterionId() == null) {
                throw new InvalidRequestException("A start-time criterion is required for this plan status");
            }
            StartTimeCriterion criterion = criterionRepository.findByIdAndUserId(request.startTimeCriterionId(), userId)
                    .orElseThrow(() -> new ResourceNotFoundException("Start time criterion not found: " + request.startTimeCriterionId()));
            if (!criterion.isSelectableForNewUse()) {
                throw new InvalidRequestException("This start-time criterion is not available for new selection");
            }
            resolvedCriterionId = criterion.getId();
        }

        if (request.plannedStatus().leaveConsumption().signum() > 0) {
            leaveAllowanceService.requireSufficientBalance(userId, planDate, request.plannedStatus());
        }

        AttendancePlan plan = repository.findByUserIdAndPlanDate(userId, planDate)
                .orElseGet(() -> new AttendancePlan(userId, planDate));
        plan.update(request.plannedStatus(), resolvedCriterionId);
        return repository.save(plan);
    }

    @Transactional
    public void delete(LocalDate planDate) {
        if (planDate.isBefore(LocalDate.now(AppTimeZone.ZONE))) {
            throw new InvalidRequestException("A plan cannot be deleted for a date that has already elapsed");
        }
        UUID userId = currentUserProvider.getCurrentUserId();
        repository.findByUserIdAndPlanDate(userId, planDate).ifPresent(repository::delete);
    }
}
