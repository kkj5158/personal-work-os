package com.kafka.backend.attendanceplan;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlock;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRepository;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRequest;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * P1-C fix: atomically replaces one date's ENTIRE canonical planning state
 * (AttendancePlan + PlannedTimeBlocks) inside a single database transaction.
 *
 * This is a deliberately narrow, purpose-built bridge between the two
 * otherwise-decoupled planning domains — PlannedTimeBlock has no FK to
 * AttendancePlan and no other backend coupling to it (see
 * docs/product/work-attendance-management-design.md §9 on why), and that
 * stays true everywhere else. This service exists only because broadcast
 * paste's overwrite path previously did delete-blocks / upsert-plan /
 * create-blocks as three independently-failing frontend requests
 * (Promise.allSettled does not make that atomic) — a request 2 or 3 failure
 * could leave a target with its old blocks gone, a partially-saved plan, and
 * only some of the replacement blocks created. Wrapping the whole sequence
 * in one @Transactional method means any failure (plan validation, a block
 * validation/overlap error, a DB constraint) rolls back everything for that
 * target — it is left in its previous consistent state, never half-replaced.
 *
 * WorkRecord is never referenced anywhere in this class.
 */
@Service
public class AttendancePlanningReplaceService {

    private final AttendancePlanService attendancePlanService;
    private final PlannedTimeBlockService plannedTimeBlockService;
    private final PlannedTimeBlockRepository plannedTimeBlockRepository;
    private final CurrentUserProvider currentUserProvider;

    public AttendancePlanningReplaceService(
            AttendancePlanService attendancePlanService,
            PlannedTimeBlockService plannedTimeBlockService,
            PlannedTimeBlockRepository plannedTimeBlockRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.attendancePlanService = attendancePlanService;
        this.plannedTimeBlockService = plannedTimeBlockService;
        this.plannedTimeBlockRepository = plannedTimeBlockRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional
    public AttendancePlanningReplaceResult replace(LocalDate date, AttendancePlanningReplaceRequest request) {
        if (date == null) {
            throw new InvalidRequestException("date is required");
        }
        // Same historical-immutability rule as AttendancePlanService.upsert —
        // checked first, before any mutation, so a past date is rejected with
        // zero side effects rather than relying on the frontend's own
        // isPlannable filtering as the only protection.
        if (date.isBefore(LocalDate.now(AppTimeZone.ZONE))) {
            throw new InvalidRequestException("Planning data cannot be replaced for a date that has already elapsed");
        }
        if (request.blocks() == null) {
            throw new InvalidRequestException("blocks is required (use an empty list for none)");
        }

        UUID userId = currentUserProvider.getCurrentUserId();

        // request.plan() == null means "leave whatever plan already exists
        // untouched" — never interpreted as "delete the existing plan".
        AttendancePlan plan = request.plan() != null
                ? attendancePlanService.upsert(date, request.plan())
                : attendancePlanService.find(date).orElse(null);

        OffsetDateTime dayStart = AppTimeZone.toStored(date.atStartOfDay());
        OffsetDateTime dayEnd = AppTimeZone.toStored(date.plusDays(1).atStartOfDay());
        List<PlannedTimeBlock> existingBlocks = plannedTimeBlockRepository.findOverlapping(userId, dayStart, dayEnd);
        plannedTimeBlockRepository.deleteAll(existingBlocks);

        List<PlannedTimeBlock> createdBlocks = new ArrayList<>();
        for (PlannedTimeBlockRequest blockRequest : request.blocks()) {
            createdBlocks.add(plannedTimeBlockService.create(
                    blockRequest.title(),
                    AppTimeZone.toStored(blockRequest.startAt()),
                    AppTimeZone.toStored(blockRequest.endAt()),
                    blockRequest.categoryId(),
                    blockRequest.memo()
            ));
        }

        return new AttendancePlanningReplaceResult(plan, createdBlocks);
    }
}
