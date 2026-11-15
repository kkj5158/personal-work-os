package com.kafka.backend.orbit;

import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

class DietContextServiceTest {
    @Test
    void defaultRangeUsesFourteenKstCalendarDays() {
        var today = LocalDate.of(2026, 11, 1);
        var range = DietContextService.range(null, null, today);
        assertThat(range.from()).isEqualTo(LocalDate.of(2026, 10, 19));
        assertThat(range.to()).isEqualTo(today);
    }

    @Test
    void invalidOrFutureRangesAreRejected() {
        var today = LocalDate.of(2026, 11, 1);
        assertThatThrownBy(() -> DietContextService.range("2026-10-01", null, today))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> DietContextService.range("2026-10-01", "2026-11-01", today))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> DietContextService.range("2026-11-02", "2026-11-02", today))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> DietContextService.range("invalid", "2026-11-01", today))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> DietContextService.range("2026-11-01", "2026-10-30", today))
                .isInstanceOf(InvalidRequestException.class);
    }

    @SuppressWarnings("unchecked")
    @Test
    void emptyPeriodNeverInventsMeasurementsOrZeroValues() {
        var range = new DietContextService.Range(LocalDate.of(2026, 10, 19), LocalDate.of(2026, 11, 1));
        var payload = DietContextService.summarize(range, List.of());
        assertThat(payload.get("hasData")).isEqualTo(false);
        var metrics = (Map<String, Object>) payload.get("metrics");
        var weight = (Map<String, Object>) metrics.get("weight");
        assertThat(weight.get("samples")).isEqualTo(0);
        assertThat(weight.get("last")).isNull();
        assertThat(weight.get("change")).isNull();
        assertThat(weight.get("average")).isNull();
    }

    @SuppressWarnings("unchecked")
    @Test
    void actualWeightHistoryProvidesTrendWithoutModifyingRecords() {
        var first = LocalDate.of(2026, 10, 20);
        var second = LocalDate.of(2026, 10, 22);
        var readings = List.of(
                new DietContextService.Reading(first, first.atTime(7, 0), "weight", "MORNING", 103.2, "kg"),
                new DietContextService.Reading(second, second.atTime(7, 0), "weight", "MORNING", 102.7, "kg"),
                new DietContextService.Reading(second, second.atTime(8, 0), "glucose", "MORNING", 95, "mg/dL"));
        var payload = DietContextService.summarize(
                new DietContextService.Range(first, second), readings);
        assertThat(payload.get("hasData")).isEqualTo(true);
        assertThat((List<?>) payload.get("readings")).hasSize(3);
        var metrics = (Map<String, Object>) payload.get("metrics");
        var weight = (Map<String, Object>) metrics.get("weight");
        assertThat(weight.get("samples")).isEqualTo(2);
        assertThat(weight.get("recordedDays")).isEqualTo(2);
        assertThat(weight.get("change")).isEqualTo(-0.5);
        assertThat(weight.get("average")).isEqualTo(102.95);
        var bloodKetone = (Map<String, Object>) metrics.get("bloodKetone");
        assertThat(bloodKetone.get("average")).isNull();
    }
}
