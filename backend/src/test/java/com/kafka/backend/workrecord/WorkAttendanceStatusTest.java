package com.kafka.backend.workrecord;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class WorkAttendanceStatusTest {

    @Test
    void workEarlyLeaveAndHalfDayAreWorkdayStatuses() {
        assertThat(WorkAttendanceStatus.WORK.isWorkday()).isTrue();
        assertThat(WorkAttendanceStatus.EARLY_LEAVE.isWorkday()).isTrue();
        assertThat(WorkAttendanceStatus.HALF_DAY.isWorkday()).isTrue();
    }

    @Test
    void dayOffPaidLeaveSickLeaveAndAbsentAreNotWorkdayStatuses() {
        assertThat(WorkAttendanceStatus.DAY_OFF.isWorkday()).isFalse();
        assertThat(WorkAttendanceStatus.PAID_LEAVE.isWorkday()).isFalse();
        assertThat(WorkAttendanceStatus.SICK_LEAVE.isWorkday()).isFalse();
        assertThat(WorkAttendanceStatus.ABSENT.isWorkday()).isFalse();
    }

    @Test
    void paidLeaveConsumesOneFullDay() {
        assertThat(WorkAttendanceStatus.PAID_LEAVE.leaveConsumption()).isEqualByComparingTo(BigDecimal.ONE);
    }

    @Test
    void halfDayConsumesHalfADay() {
        assertThat(WorkAttendanceStatus.HALF_DAY.leaveConsumption()).isEqualByComparingTo(new BigDecimal("0.5"));
    }

    @Test
    void everyOtherStatusConsumesNoLeave() {
        assertThat(WorkAttendanceStatus.WORK.leaveConsumption()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(WorkAttendanceStatus.EARLY_LEAVE.leaveConsumption()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(WorkAttendanceStatus.DAY_OFF.leaveConsumption()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(WorkAttendanceStatus.SICK_LEAVE.leaveConsumption()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(WorkAttendanceStatus.ABSENT.leaveConsumption()).isEqualByComparingTo(BigDecimal.ZERO);
    }
}
