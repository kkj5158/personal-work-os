package com.kafka.backend.worksettings;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface WorkSettingsRepository extends JpaRepository<WorkSettings, UUID> {

    Optional<WorkSettings> findByUserIdAndSettingYear(UUID userId, Integer settingYear);
}
