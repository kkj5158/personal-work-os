package com.kafka.backend.project;

import java.time.LocalDate;

public record PhaseRequest(String title, LocalDate startDate, LocalDate endDate) {
}
