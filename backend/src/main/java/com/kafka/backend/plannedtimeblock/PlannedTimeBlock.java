package com.kafka.backend.plannedtimeblock;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * The Calendar's "PlanningBlock" — WORK or LIFE, per {@link #domainType}.
 * {@code activityCategoryId} applies to WORK blocks, {@code lifeCategoryId}
 * to LIFE blocks; a block only ever populates the one matching its domain.
 * {@code phaseId} is an optional lightweight Project/Phase context link
 * (Project is always derived via Phase, never duplicated here).
 * <p>
 * Planning overlap is intentionally ALLOWED (locked V1 policy) — this class
 * and its repository impose no non-overlap constraint; the frontend splits
 * overlapping blocks into visual lanes for the overlapping interval only.
 */
@Entity
@Table(name = "planned_time_blocks")
public class PlannedTimeBlock {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "domain_type", nullable = false)
    private PlanDomainType domainType;

    @Column(name = "activity_category_id")
    private UUID activityCategoryId;

    @Column(name = "life_category_id")
    private UUID lifeCategoryId;

    @Column(name = "phase_id")
    private UUID phaseId;

    @Column(name = "title", nullable = false)
    private String title;

    @Column(name = "plan_date", nullable = false)
    private java.time.LocalDate planDate;

    @Column(name = "start_at")
    private OffsetDateTime startAt;

    @Column(name = "end_at")
    private OffsetDateTime endAt;

    @Column(name = "memo")
    private String memo;

    @Column(name = "converted_source_type")
    private String convertedSourceType;
    @Column(name = "converted_source_id")
    private UUID convertedSourceId;
    @Column(name = "preferred_actual_source_type")
    private String preferredActualSourceType;
    @Column(name = "retained_duration_minutes")
    private Integer retainedDurationMinutes;

    public String getConvertedSourceType() { return convertedSourceType; }
    public UUID getConvertedSourceId() { return convertedSourceId; }
    public String getPreferredActualSourceType() { return preferredActualSourceType; }
    public Integer getRetainedDurationMinutes() { return retainedDurationMinutes; }
    public void retainActualDefaults(String type, Integer duration) {
        preferredActualSourceType=sourceForDomain(type);retainedDurationMinutes=duration;
        if(startAt!=null && endAt!=null && !"SUPPLEMENTAL_WORK_ENTRY".equals(preferredActualSourceType))
            retainedDurationMinutes=intervalMinutes(startAt,endAt);
    }
    private String sourceForDomain(String type) {
        if(type==null)return null;
        return domainType==PlanDomainType.LIFE ? "LIFE_TIME_ENTRY"
                : "SUPPLEMENTAL_WORK_ENTRY".equals(type) ? type : "WORK_TIME_ENTRY";
    }
    private Integer intervalMinutes(OffsetDateTime start,OffsetDateTime end) {
        return start==null || end==null ? null : (int)java.time.Duration.between(start,end).toMinutes();
    }
    public void convertToActual(String type, UUID id) { convertedSourceType=type; convertedSourceId=id; }
    public void convertToPlan() { convertedSourceType=null; convertedSourceId=null; }

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected PlannedTimeBlock() {
    }

    public PlannedTimeBlock(
            UUID userId,
            PlanDomainType domainType,
            String title,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            UUID activityCategoryId,
            UUID lifeCategoryId,
            UUID phaseId,
            String memo
    ) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.domainType = domainType;
        this.title = title;
        this.startAt = startAt;
        if(startAt != null)this.planDate = com.kafka.backend.common.AppTimeZone.toDisplay(startAt).toLocalDate();
        this.endAt = endAt;
        this.activityCategoryId = activityCategoryId;
        this.lifeCategoryId = lifeCategoryId;
        this.phaseId = phaseId;
        this.memo = memo;
    }

    public void update(
            PlanDomainType domainType,
            String title,
            OffsetDateTime startAt,
            OffsetDateTime endAt,
            UUID activityCategoryId,
            UUID lifeCategoryId,
            UUID phaseId,
            String memo
    ) {
        this.domainType = domainType;
        this.title = title;
        preferredActualSourceType=sourceForDomain(preferredActualSourceType);
        reschedule(startAt,endAt);
        this.activityCategoryId = activityCategoryId;
        this.lifeCategoryId = lifeCategoryId;
        this.phaseId = phaseId;
        this.memo = memo;
    }

    /** Same-date move/resize from direct calendar manipulation — drag, resize, move to another date. */
    public void reschedule(OffsetDateTime startAt, OffsetDateTime endAt) {
        Integer previous=intervalMinutes(this.startAt,this.endAt), next=intervalMinutes(startAt,endAt);
        // A move keeps Supplemental's separate work amount; resizing explicitly changes it.
        if(next!=null && (!"SUPPLEMENTAL_WORK_ENTRY".equals(preferredActualSourceType)
                || retainedDurationMinutes==null || (previous!=null && !previous.equals(next))))
            retainedDurationMinutes=next;
        this.startAt = startAt;
        if(startAt != null)this.planDate = com.kafka.backend.common.AppTimeZone.toDisplay(startAt).toLocalDate();
        this.endAt = endAt;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    public java.time.LocalDate getPlanDate() {return planDate;}
    public void setPlanDate(java.time.LocalDate date) {this.planDate=date;}

    /** Used only by owner-scoped server Undo snapshots. */
    public void restoreIdentity(UUID id) {this.id=id;}

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public PlanDomainType getDomainType() {
        return domainType;
    }

    public UUID getActivityCategoryId() {
        return activityCategoryId;
    }

    public UUID getLifeCategoryId() {
        return lifeCategoryId;
    }

    public UUID getPhaseId() {
        return phaseId;
    }

    public String getTitle() {
        return title;
    }

    public OffsetDateTime getStartAt() {
        return startAt;
    }

    public OffsetDateTime getEndAt() {
        return endAt;
    }

    public String getMemo() {
        return memo;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
