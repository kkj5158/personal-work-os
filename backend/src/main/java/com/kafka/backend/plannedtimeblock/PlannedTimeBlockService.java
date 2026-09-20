package com.kafka.backend.plannedtimeblock;

import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.lifecategory.LifeCategoryRepository;
import com.kafka.backend.project.PhaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Planning overlap is intentionally ALLOWED (locked V1 policy) — unlike an
 * earlier revision of this service, no overlap check runs here. The
 * Calendar frontend is responsible for splitting overlapping blocks into
 * visual lanes for their overlapping interval only.
 */
@Service
public class PlannedTimeBlockService {

    private final PlannedTimeBlockRepository blockRepository;
    private final ActivityCategoryRepository activityCategoryRepository;
    private final LifeCategoryRepository lifeCategoryRepository;
    private final PhaseRepository phaseRepository;
    private final CurrentUserProvider currentUserProvider;

    public PlannedTimeBlockService(
            PlannedTimeBlockRepository blockRepository,
            ActivityCategoryRepository activityCategoryRepository,
            LifeCategoryRepository lifeCategoryRepository,
            PhaseRepository phaseRepository,
            CurrentUserProvider currentUserProvider
    ) {
        this.blockRepository = blockRepository;
        this.activityCategoryRepository = activityCategoryRepository;
        this.lifeCategoryRepository = lifeCategoryRepository;
        this.phaseRepository = phaseRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public List<PlannedTimeBlock> findInRange(OffsetDateTime rangeStart, OffsetDateTime rangeEnd) {
        if (rangeStart == null || rangeEnd == null || !rangeEnd.isAfter(rangeStart)) {
            throw new InvalidRequestException("rangeEnd must be after rangeStart");
        }
        return blockRepository.findOverlapping(currentUserProvider.getCurrentUserId(), rangeStart, rangeEnd);
    }

    public PlannedTimeBlock create(
            PlanDomainType domainType, String title, OffsetDateTime startAt, OffsetDateTime endAt,
            UUID activityCategoryId, UUID lifeCategoryId, UUID phaseId, String memo
    ) {
        validateTitle(title);
        validateTimeRange(startAt, endAt);
        UUID userId = currentUserProvider.getCurrentUserId();
        validateDomainShape(domainType, activityCategoryId, lifeCategoryId, userId);
        validatePhaseOwnership(phaseId, userId);

        PlannedTimeBlock block = new PlannedTimeBlock(
                userId, domainType, title.trim(), startAt, endAt, activityCategoryId, lifeCategoryId, phaseId, normalizeMemo(memo)
        );
        return blockRepository.save(block);
    }

    /** Read-only batch preflight; creation keeps the same validation rules. */
    public void validateNew(PlannedTimeBlockRequest p) {
        if(p==null)throw new InvalidRequestException("Planning values are required");
        validateTitle(p.title());
        if(p.startAt()==null && p.date()==null)throw new InvalidRequestException("시간 미지정 계획의 날짜가 필요합니다.");
        if(p.startAt()!=null || p.endAt()!=null)validateTimeRange(p.startAt()==null ? null : com.kafka.backend.common.AppTimeZone.toStored(p.startAt()),p.endAt()==null ? null : com.kafka.backend.common.AppTimeZone.toStored(p.endAt()));
        UUID user=currentUserProvider.getCurrentUserId();
        validateDomainShape(p.domainType(),p.activityCategoryId(),p.lifeCategoryId(),user);
        validatePhaseOwnership(p.phaseId(),user);
    }

    public PlannedTimeBlock update(
            UUID id, PlanDomainType domainType, String title, OffsetDateTime startAt, OffsetDateTime endAt,
            UUID activityCategoryId, UUID lifeCategoryId, UUID phaseId, String memo
    ) {
        validateTitle(title);
        validateTimeRange(startAt, endAt);
        UUID userId = currentUserProvider.getCurrentUserId();
        validateDomainShape(domainType, activityCategoryId, lifeCategoryId, userId);
        validatePhaseOwnership(phaseId, userId);

        PlannedTimeBlock block = findOwned(id, userId);
        block.update(domainType, title.trim(), startAt, endAt, activityCategoryId, lifeCategoryId, phaseId, normalizeMemo(memo));
        return blockRepository.save(block);
    }

    /** Direct calendar manipulation (drag/resize/move to another date) — saves immediately. */
    public PlannedTimeBlock reschedule(UUID id, OffsetDateTime startAt, OffsetDateTime endAt) {
        validateTimeRange(startAt, endAt);
        UUID userId = currentUserProvider.getCurrentUserId();
        PlannedTimeBlock block = findOwned(id, userId);
        block.reschedule(startAt, endAt);
        return blockRepository.save(block);
    }

    /** Duplicate on the same date or to another date — preserves title, category/context, phase, memo, duration. */
    public PlannedTimeBlock duplicate(UUID id, OffsetDateTime newStartAt) {
        UUID userId = currentUserProvider.getCurrentUserId();
        PlannedTimeBlock source = findOwned(id, userId);
        long durationMinutes = java.time.Duration.between(source.getStartAt(), source.getEndAt()).toMinutes();
        OffsetDateTime newEndAt = newStartAt.plusMinutes(durationMinutes);

        PlannedTimeBlock copy = new PlannedTimeBlock(
                userId, source.getDomainType(), source.getTitle(), newStartAt, newEndAt,
                source.getActivityCategoryId(), source.getLifeCategoryId(), source.getPhaseId(), source.getMemo()
        );
        return blockRepository.save(copy);
    }

    @Transactional
    public PlannedTimeBlock saveRequest(UUID id, PlannedTimeBlockRequest r) {
        validateNew(r);
        var b=id==null ? new PlannedTimeBlock(currentUserProvider.getCurrentUserId(),r.domainType(),r.title().trim(),com.kafka.backend.common.AppTimeZone.toStored(r.startAt()),com.kafka.backend.common.AppTimeZone.toStored(r.endAt()),r.activityCategoryId(),r.lifeCategoryId(),r.phaseId(),normalizeMemo(r.memo())) : findOwned(id,currentUserProvider.getCurrentUserId());
        if(id!=null)b.update(r.domainType(),r.title().trim(),com.kafka.backend.common.AppTimeZone.toStored(r.startAt()),com.kafka.backend.common.AppTimeZone.toStored(r.endAt()),r.activityCategoryId(),r.lifeCategoryId(),r.phaseId(),normalizeMemo(r.memo()));
        b.setPlanDate(r.startAt()==null ? r.date() : r.startAt().toLocalDate());
        return blockRepository.save(b);
    }

    @Transactional
    public PlannedTimeBlock restoreRequest(UUID id,PlannedTimeBlockRequest r) {
        validateNew(r);
        if(blockRepository.existsById(id))throw new InvalidRequestException("Plan identity already exists");
        var b=new PlannedTimeBlock(currentUserProvider.getCurrentUserId(),r.domainType(),r.title(),com.kafka.backend.common.AppTimeZone.toStored(r.startAt()),com.kafka.backend.common.AppTimeZone.toStored(r.endAt()),r.activityCategoryId(),r.lifeCategoryId(),r.phaseId(),r.memo());
        b.restoreIdentity(id);b.setPlanDate(r.startAt()==null ? r.date() : r.startAt().toLocalDate());
        return blockRepository.save(b);
    }

    public void delete(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        blockRepository.delete(findOwned(id, userId));
    }

    private PlannedTimeBlock findOwned(UUID id, UUID userId) {
        return blockRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Planned time block not found: " + id));
    }

    private void validateTitle(String title) {
        if (title == null || title.isBlank()) {
            throw new InvalidRequestException("Title must not be blank");
        }
    }

    private void validateTimeRange(OffsetDateTime startAt, OffsetDateTime endAt) {
        if (startAt == null || endAt == null || !endAt.isAfter(startAt)) {
            throw new InvalidRequestException("endAt must be after startAt");
        }
    }

    private void validateDomainShape(PlanDomainType domainType, UUID activityCategoryId, UUID lifeCategoryId, UUID userId) {
        if (domainType == null) {
            throw new InvalidRequestException("domainType is required");
        }
        if (domainType == PlanDomainType.WORK) {
            if (lifeCategoryId != null) {
                throw new InvalidRequestException("A WORK block cannot carry a lifeCategoryId");
            }
            if (activityCategoryId != null) {
                activityCategoryRepository.findByIdAndUserId(activityCategoryId, userId)
                        .orElseThrow(() -> new ResourceNotFoundException("Activity category not found: " + activityCategoryId));
            }
        } else {
            if (activityCategoryId != null) {
                throw new InvalidRequestException("A LIFE block cannot carry an activityCategoryId");
            }
            if (lifeCategoryId != null) {
                lifeCategoryRepository.findByIdAndUserId(lifeCategoryId, userId)
                        .orElseThrow(() -> new ResourceNotFoundException("Life category not found: " + lifeCategoryId));
            }
        }
    }

    private void validatePhaseOwnership(UUID phaseId, UUID userId) {
        if (phaseId == null) {
            return;
        }
        phaseRepository.findByIdAndUserId(phaseId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Phase not found: " + phaseId));
    }

    private String normalizeMemo(String memo) {
        if (memo == null) return null;
        String trimmed = memo.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
