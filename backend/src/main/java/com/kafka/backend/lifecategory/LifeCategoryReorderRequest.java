package com.kafka.backend.lifecategory;

import java.util.List;
import java.util.UUID;

public record LifeCategoryReorderRequest(List<UUID> orderedIds) {
}
