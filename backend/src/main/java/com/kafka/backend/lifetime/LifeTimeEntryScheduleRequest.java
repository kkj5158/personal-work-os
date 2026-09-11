package com.kafka.backend.lifetime;

import java.time.LocalTime;

public record LifeTimeEntryScheduleRequest(LocalTime startTime, LocalTime endTime) {
}
