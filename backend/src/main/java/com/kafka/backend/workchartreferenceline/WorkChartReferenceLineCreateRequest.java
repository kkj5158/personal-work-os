package com.kafka.backend.workchartreferenceline;

public record WorkChartReferenceLineCreateRequest(
        WorkChartReferenceLineScope scope,
        String label,
        Integer value,
        WorkChartReferenceLineColor color
) {
}
