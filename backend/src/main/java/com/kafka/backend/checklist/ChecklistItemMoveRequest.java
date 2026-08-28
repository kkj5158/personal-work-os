package com.kafka.backend.checklist;

import java.util.UUID;

/** {@code categoryId == null} moves the item to "Uncategorized". */
public record ChecklistItemMoveRequest(UUID categoryId) {
}
