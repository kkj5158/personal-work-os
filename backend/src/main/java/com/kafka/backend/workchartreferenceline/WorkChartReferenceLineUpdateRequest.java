package com.kafka.backend.workchartreferenceline;

public record WorkChartReferenceLineUpdateRequest(
        String label,
        Integer value,
        WorkChartReferenceLineColor color
) {
}
