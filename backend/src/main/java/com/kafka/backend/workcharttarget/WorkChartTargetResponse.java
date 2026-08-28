package com.kafka.backend.workcharttarget;

public record WorkChartTargetResponse(int targetWorkMinutes, int targetScore) {

    /** A reasonable out-of-the-box baseline (8h / 80 points) shown until the
     *  user configures their own — never persisted on its own. */
    public static final WorkChartTargetResponse DEFAULT = new WorkChartTargetResponse(480, 80);

    public static WorkChartTargetResponse from(WorkChartTarget target) {
        return new WorkChartTargetResponse(target.getTargetWorkMinutes(), target.getTargetScore());
    }
}
