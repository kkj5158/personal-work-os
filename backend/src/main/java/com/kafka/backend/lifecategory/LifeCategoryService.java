package com.kafka.backend.lifecategory;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.lifetime.LifeTimeEntryRepository;
import com.kafka.backend.plannedtimeblock.PlannedTimeBlockRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class LifeCategoryService {

    private final LifeCategoryRepository repository;
    private final CurrentUserProvider currentUserProvider;
    private final LifeTimeEntryRepository lifeTimeEntryRepository;
    private final PlannedTimeBlockRepository plannedTimeBlockRepository;

    public LifeCategoryService(
            LifeCategoryRepository repository,
            CurrentUserProvider currentUserProvider,
            LifeTimeEntryRepository lifeTimeEntryRepository,
            PlannedTimeBlockRepository plannedTimeBlockRepository
    ) {
        this.repository = repository;
        this.currentUserProvider = currentUserProvider;
        this.lifeTimeEntryRepository = lifeTimeEntryRepository;
        this.plannedTimeBlockRepository = plannedTimeBlockRepository;
    }

    @Transactional(readOnly = true)
    public List<LifeCategory> list() {
        return repository.findByUserIdOrderBySortOrderAscNameAsc(currentUserProvider.getCurrentUserId());
    }

    public LifeCategory create(String name) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Category name must not be blank");
        }
        UUID userId = currentUserProvider.getCurrentUserId();
        boolean hasDefault = repository.findByUserIdAndIsDefaultTrue(userId).isPresent();
        return repository.save(new LifeCategory(userId, name.trim(), !hasDefault));
    }

    public LifeCategory rename(UUID id, String name) {
        if (name == null || name.isBlank()) {
            throw new InvalidRequestException("Category name must not be blank");
        }
        LifeCategory target = findOwned(id);
        target.rename(name.trim());
        return repository.save(target);
    }

    @Transactional
    public void reorder(List<UUID> orderedIds) {
        if (orderedIds == null || orderedIds.isEmpty()) {
            throw new InvalidRequestException("orderedIds must not be empty");
        }
        UUID userId = currentUserProvider.getCurrentUserId();
        List<LifeCategory> current = repository.findByUserIdOrderBySortOrderAscNameAsc(userId);
        Map<UUID, LifeCategory> byId = current.stream()
                .collect(Collectors.toMap(LifeCategory::getId, category -> category));

        if (orderedIds.size() != byId.size() || !byId.keySet().containsAll(orderedIds)) {
            throw new InvalidRequestException("orderedIds must contain exactly the current category set, no more and no fewer");
        }

        for (int position = 0; position < orderedIds.size(); position++) {
            byId.get(orderedIds.get(position)).reorder(position);
        }
        repository.saveAll(byId.values());
    }

    @Transactional
    public LifeCategory setDefault(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        LifeCategory target = findOwned(id);
        if (!Boolean.TRUE.equals(target.getIsActive())) {
            throw new InvalidRequestException("An inactive category cannot be set as a default");
        }
        if (Boolean.TRUE.equals(target.getIsDefault())) {
            return target;
        }
        repository.findByUserIdAndIsDefaultTrue(userId).ifPresent(previous -> {
            previous.clearDefault();
            repository.saveAndFlush(previous);
        });
        target.markAsDefault();
        return repository.save(target);
    }

    @Transactional
    public LifeCategory setActive(UUID id, boolean active) {
        LifeCategory target = findOwned(id);
        if (active) {
            if (Boolean.TRUE.equals(target.getIsActive())) {
                return target;
            }
            target.activate();
            return repository.save(target);
        }
        if (!Boolean.TRUE.equals(target.getIsActive())) {
            return target;
        }
        if (Boolean.TRUE.equals(target.getIsDefault())) {
            target.clearDefault();
        }
        target.deactivate();
        return repository.save(target);
    }

    @Transactional
    public void delete(UUID id) {
        LifeCategory target = findOwned(id);
        if (lifeTimeEntryRepository.existsByLifeCategoryId(target.getId())
                || plannedTimeBlockRepository.existsByLifeCategoryId(target.getId())) {
            throw new InvalidRequestException("Category is referenced by existing records and cannot be deleted");
        }
        repository.delete(target);
    }

    private LifeCategory findOwned(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        return repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Life category not found: " + id));
    }
}
