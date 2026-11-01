package com.kafka.backend.orbit;

import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.*;

class OrbitReadServiceTest {
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 1);

    @Test
    void defaultRangeIsFourteenInclusiveDays() {
        var p = OrbitReadService.period(null, null, TODAY);
        assertThat(p.from()).isEqualTo(LocalDate.of(2026, 10, 19));
        assertThat(p.to()).isEqualTo(TODAY);
    }

    @Test
    void rejectsMalformedUnboundedFutureAndReversedRanges() {
        assertThatThrownBy(() -> OrbitReadService.period("2026-10-01", null, TODAY))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> OrbitReadService.period("bad", "2026-11-01", TODAY))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> OrbitReadService.period("2026-10-01", "2026-11-01", TODAY))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> OrbitReadService.period("2026-11-01", "2026-11-02", TODAY))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> OrbitReadService.period("2026-11-01", "2026-10-31", TODAY))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void planningPeriodsCanIncludeFutureDatesWithoutChangingHistoricalRules() {
        var p = OrbitReadService.planningPeriod("2026-11-02", "2026-11-10", TODAY);
        assertThat(p.from()).isEqualTo(LocalDate.of(2026, 11, 2));
        assertThat(p.to()).isEqualTo(LocalDate.of(2026, 11, 10));
        assertThatThrownBy(() -> OrbitReadService.planningPeriod(
                "2026-11-02", "2026-12-10", TODAY))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> OrbitReadService.planningPeriod(
                "2026-10-01", "2026-11-02", TODAY))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void paginationIsBoundedAndStableForEmptyPages() {
        assertThat(OrbitReadService.slice(List.of("a", "b", "c"), 2, 0))
                .containsExactly("a", "b");
        assertThat(OrbitReadService.slice(List.of("a", "b", "c"), 2, 2))
                .containsExactly("c");
        assertThat(OrbitReadService.slice(List.of("a"), 2, 100))
                .isEmpty();
        assertThatThrownBy(() -> OrbitReadService.limit(101))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> OrbitReadService.limit(0))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> OrbitReadService.offset(-1))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> OrbitReadService.offset(10001))
                .isInstanceOf(InvalidRequestException.class);
    }

    @Test
    void orbitReadCatalogContainsExactlyTwentyUniqueGetEndpoints() {
        var classes = List.of(
                SleepContextController.class,
                DietContextController.class,
                OrbitReadController.class);
        var routes = classes.stream()
                .flatMap(type -> Arrays.stream(type.getDeclaredMethods()))
                .map(method -> method.getAnnotation(GetMapping.class))
                .filter(annotation -> annotation != null)
                .flatMap(annotation -> Stream.concat(
                        Arrays.stream(annotation.value()),
                        Arrays.stream(annotation.path())))
                .distinct()
                .toList();
        assertThat(routes).hasSize(20);
        assertThat(routes).contains(
                "/get_sleep_context",
                "/get_recovery_context",
                "/get_diet_context",
                "/get_money_earnings_context",
                "/get_workflow_waiting_context");
    }
}
