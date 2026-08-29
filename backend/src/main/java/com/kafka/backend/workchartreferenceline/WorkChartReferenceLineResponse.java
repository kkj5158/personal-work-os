package com.kafka.backend.workchartreferenceline;

import java.util.UUID;

public record WorkChartReferenceLineResponse(
        UUID id,
        WorkChartReferenceLineScope scope,
        Integer position,
        String label,
        Integer value,
        WorkChartReferenceLineColor color
) {
    public static WorkChartReferenceLineResponse from(WorkChartReferenceLine line) {
        return new WorkChartReferenceLineResponse(
                line.getId(),
                line.getScope(),
                line.getPosition(),
                line.getLabel(),
                line.getValue(),
                line.getColor()
        );
    }
}
