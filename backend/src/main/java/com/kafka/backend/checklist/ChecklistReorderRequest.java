package com.kafka.backend.checklist;

import java.util.List;
import java.util.UUID;

public record ChecklistReorderRequest(List<UUID> orderedIds) {
}
