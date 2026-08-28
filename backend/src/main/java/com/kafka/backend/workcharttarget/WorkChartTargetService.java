package com.kafka.backend.workcharttarget;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class WorkChartTargetService {

    private final WorkChartTargetRepository repository;
    private final CurrentUserProvider currentUserProvider;

    public WorkChartTargetService(WorkChartTargetRepository repository, CurrentUserProvider currentUserProvider) {
        this.repository = repository;
        this.currentUserProvider = currentUserProvider;
    }

    public WorkChartTargetResponse get() {
        UUID userId = currentUserProvider.getCurrentUserId();
        return repository.findByUserId(userId)
                .map(WorkChartTargetResponse::from)
                .orElse(WorkChartTargetResponse.DEFAULT);
    }

    public WorkChartTargetResponse update(Integer targetWorkMinutes, Integer targetScore) {
        if (targetWorkMinutes == null || targetWorkMinutes <= 0 || targetWorkMinutes > 1440) {
            throw new InvalidRequestException("Target work minutes must be between 1 and 1440");
        }
        if (targetScore == null || targetScore < 0 || targetScore > 100) {
            throw new InvalidRequestException("Target score must be between 0 and 100");
        }

        UUID userId = currentUserProvider.getCurrentUserId();
        WorkChartTarget target = repository.findByUserId(userId)
                .orElseGet(() -> new WorkChartTarget(userId, targetWorkMinutes, targetScore));
        target.update(targetWorkMinutes, targetScore);
        return WorkChartTargetResponse.from(repository.save(target));
    }
}
