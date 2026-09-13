package com.kafka.backend.lifecategory;

import java.util.UUID;

public record LifeCategoryRequest(String name, UUID parentId) {}
