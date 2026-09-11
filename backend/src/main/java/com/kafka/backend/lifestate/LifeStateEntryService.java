package com.kafka.backend.lifestate;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class LifeStateEntryService {

    private final LifeStateEntryRepository repository;
    private final CurrentUserProvider currentUserProvider;

    public LifeStateEntryService(LifeStateEntryRepository repository, CurrentUserProvider currentUserProvider) {
        this.repository = repository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public List<LifeStateEntry> findInRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from)) {
            throw new InvalidRequestException("to must not be before from");
        }
        return repository.findByUserIdAndEntryDateBetweenOrderByStartAtAsc(currentUserProvider.getCurrentUserId(), from, to);
    }

    public LifeStateEntry create(LocalDate entryDate, StateGroup stateGroup, String label, OffsetDateTime startAt, OffsetDateTime endAt, String memo) {
        validateShape(entryDate, stateGroup, label, startAt, endAt);
        UUID userId = currentUserProvider.getCurrentUserId();
        validateNoSelfOverlap(userId, startAt, endAt, null);

        LifeStateEntry entry = new LifeStateEntry(userId, entryDate, stateGroup, label.trim(), startAt, endAt, normalizeMemo(memo));
        return repository.save(entry);
    }

    public LifeStateEntry update(UUID id, StateGroup stateGroup, String label, OffsetDateTime startAt, OffsetDateTime endAt, String memo) {
        LifeStateEntry entry = findOwned(id);
        validateShape(entry.getEntryDate(), stateGroup, label, startAt, endAt);
        UUID userId = currentUserProvider.getCurrentUserId();
        validateNoSelfOverlap(userId, startAt, endAt, id);

        entry.applyChanges(stateGroup, label.trim(), startAt, endAt, normalizeMemo(memo));
        return repository.save(entry);
    }

    public void delete(UUID id) {
        repository.delete(findOwned(id));
    }

    private LifeStateEntry findOwned(UUID id) {
        UUID userId = currentUserProvider.getCurrentUserId();
        return repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Life state entry not found: " + id));
    }

    private void validateShape(LocalDate entryDate, StateGroup stateGroup, String label, OffsetDateTime startAt, OffsetDateTime endAt) {
        if (entryDate == null) {
            throw new InvalidRequestException("entryDate is required");
        }
        if (stateGroup == null) {
            throw new InvalidRequestException("stateGroup is required");
        }
        if (label == null || label.isBlank()) {
            throw new InvalidRequestException("label must not be blank");
        }
        if (startAt == null || endAt == null || !endAt.isAfter(startAt)) {
            throw new InvalidRequestException("endAt must be after startAt");
        }
    }

    /** V1 policy: two State entries for the same owner must not overlap each other
     *  (State may still freely overlap Planning and Actual). */
    private void validateNoSelfOverlap(UUID userId, OffsetDateTime startAt, OffsetDateTime endAt, UUID excludeId) {
        LocalDate date = com.kafka.backend.common.AppTimeZone.toDisplay(startAt).toLocalDate();
        boolean conflicts = repository.findByUserIdAndEntryDateBetweenOrderByStartAtAsc(userId, date, date).stream()
                .filter(other -> !other.getId().equals(excludeId))
                .anyMatch(other -> startAt.isBefore(other.getEndAt()) && endAt.isAfter(other.getStartAt()));
        if (conflicts) {
            throw new InvalidRequestException("이미 같은 시간대에 다른 상태 기록이 있습니다.");
        }
    }

    private String normalizeMemo(String memo) {
        if (memo == null) return null;
        String trimmed = memo.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
