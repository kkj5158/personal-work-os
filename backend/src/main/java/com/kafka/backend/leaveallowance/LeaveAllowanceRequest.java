package com.kafka.backend.leaveallowance;

import java.math.BigDecimal;

/** Body for {@code PUT /api/leave-allowances/{year}/{month}}. */
public record LeaveAllowanceRequest(BigDecimal allowanceDays) {
}
