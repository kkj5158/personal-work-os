package com.kafka.backend.workchartreferenceline;

/**
 * A restrained, fixed palette rather than a free-form color picker — each
 * token maps to an existing Personal Work OS chart/semantic color on the
 * frontend (see theme.css). GRAY is the neutral default used when migrating
 * the old single-goal baseline (see V19 migration).
 */
public enum WorkChartReferenceLineColor {
    BLUE,
    GREEN,
    AMBER,
    RED,
    CYAN,
    GRAY
}
