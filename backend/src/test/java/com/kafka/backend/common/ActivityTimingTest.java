package com.kafka.backend.common;

import org.junit.jupiter.api.Test;
import java.time.*;
import static org.assertj.core.api.Assertions.*;

class ActivityTimingTest {
    @Test void unscheduledRequiresManualDuration() {
        assertThat(ActivityTiming.duration(35, (LocalTime)null, null)).isEqualTo(35);
        assertThatThrownBy(() -> ActivityTiming.duration(null, (LocalTime)null, null)).isInstanceOf(InvalidRequestException.class);
    }
    @Test void fiveMinuteRangeIsAuthoritative() {
        assertThat(ActivityTiming.duration(999, LocalTime.of(10,5), LocalTime.of(11,35))).isEqualTo(90);
        assertThat(ActivityTiming.duration(null, LocalTime.of(10,5), LocalTime.of(11,35))).isEqualTo(90);
    }
    @Test void rejectsHalfPairsInvalidPrecisionAndCrossMidnight() {
        assertThatThrownBy(() -> ActivityTiming.duration(30, LocalTime.NOON, null)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> ActivityTiming.duration(30, LocalTime.of(10,1), LocalTime.NOON)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> ActivityTiming.duration(30, LocalTime.of(10,5,1), LocalTime.NOON)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> ActivityTiming.duration(30, LocalTime.of(23,55), LocalTime.of(0,5))).isInstanceOf(InvalidRequestException.class);
    }
}
