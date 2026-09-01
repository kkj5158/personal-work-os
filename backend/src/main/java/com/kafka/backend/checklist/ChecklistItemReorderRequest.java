package com.kafka.backend.checklist;

import java.util.List;
import java.util.UUID;

public record ChecklistItemReorderRequest(UUID categoryId, List<UUID> orderedIds) {
}
