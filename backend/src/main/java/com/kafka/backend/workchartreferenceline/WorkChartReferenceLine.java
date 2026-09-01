package com.kafka.backend.workchartreferenceline;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One user-configured reference (baseline) line for a Work Record chart —
 * the generalization of the old single-value work-chart-target concept
 * (post-production iteration 1 batch 2). At most 3 rows may exist per
 * (user, scope), positioned 0..2 in display/creation order — enforced by
 * {@link WorkChartReferenceLineService}, backstopped by the DB unique index
 * on (user_id, scope, position).
 */
@Entity
@Table(name = "work_chart_reference_lines")
public class WorkChartReferenceLine {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", nullable = false, updatable = false)
    private WorkChartReferenceLineScope scope;

    @Column(name = "position", nullable = false)
    private Integer position;

    @Column(name = "label", nullable = false)
    private String label;

    /** Minutes for a *_TIME scope (a duration — may exceed 1440 for
     *  WEEKLY_TIME), or a 0-100 point value for a *_SCORE scope. */
    @Column(name = "value", nullable = false)
    private Integer value;

    @Enumerated(EnumType.STRING)
    @Column(name = "color", nullable = false)
    private WorkChartReferenceLineColor color;

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false)
    private OffsetDateTime updatedAt;

    protected WorkChartReferenceLine() {
    }

    public WorkChartReferenceLine(
            UUID userId,
            WorkChartReferenceLineScope scope,
            Integer position,
            String label,
            Integer value,
            WorkChartReferenceLineColor color
    ) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.scope = scope;
        this.position = position;
        this.label = label;
        this.value = value;
        this.color = color;
    }

    public void update(String label, Integer value, WorkChartReferenceLineColor color) {
        this.label = label;
        this.value = value;
        this.color = color;
    }

    /** Re-numbers this row after a sibling was deleted — see
     *  WorkChartReferenceLineService.delete. */
    public void reposition(int position) {
        this.position = position;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public WorkChartReferenceLineScope getScope() {
        return scope;
    }

    public Integer getPosition() {
        return position;
    }

    public String getLabel() {
        return label;
    }

    public Integer getValue() {
        return value;
    }

    public WorkChartReferenceLineColor getColor() {
        return color;
    }
}
