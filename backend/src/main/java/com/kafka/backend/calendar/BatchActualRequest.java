package com.kafka.backend.calendar;

import java.time.LocalDate;
import java.util.List;

public record BatchActualRequest(LocalDate date, List<BatchActualItemRequest> items) {
}
