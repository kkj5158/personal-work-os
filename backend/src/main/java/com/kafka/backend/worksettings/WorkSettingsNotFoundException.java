package com.kafka.backend.worksettings;

import java.util.UUID;

public class WorkSettingsNotFoundException extends RuntimeException {

    public WorkSettingsNotFoundException(UUID userId, int settingYear) {
        super("No WorkSettings found for user " + userId + " and year " + settingYear);
    }
}
