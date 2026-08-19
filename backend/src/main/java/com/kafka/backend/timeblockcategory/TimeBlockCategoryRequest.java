package com.kafka.backend.timeblockcategory;

import java.util.UUID;

public record TimeBlockCategoryRequest(String name, UUID parentId) {
}
