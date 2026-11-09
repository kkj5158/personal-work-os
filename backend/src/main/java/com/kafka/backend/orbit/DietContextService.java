package com.kafka.backend.orbit;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * ORBIT DIET V1: bounded, owner-scoped, read-only projection of canonical
 * measurement facts. No AI judgement, goal inference, or persistence.
 */
@Service
@Transactional(readOnly = true, timeout = 10)
public class DietContextService {
    private static final int DEFAULT_DAYS = 14;
    private static final int MAX_DAYS = 31;
    private static final Map<String, String> UNITS = Map.of(
            "weight", "kg",
            "glucose", "mg/dL",
            "bloodKetone", "mmol/L",
            "breathKetone", "ppm");

    private final JdbcTemplate db;
    private final CurrentUserProvider currentUser;

    public DietContextService(JdbcTemplate db, CurrentUserProvider currentUser) {
        this.db = db;
        this.currentUser = currentUser;
    }

    public record Reading(
            LocalDate date,
            LocalDateTime measuredAt,
            String metric,
            String slot,
            double value,
            String unit) {}

    record Range(LocalDate from, LocalDate to) {}

    static Range range(String from, String to, LocalDate today) {
        if (from == null && to == null) {
            return new Range(today.minusDays(DEFAULT_DAYS - 1), today);
        }
        if (from == null || to == null || from.isBlank() || to.isBlank()) {
            throw new InvalidRequestException("from과 to 날짜를 함께 지정해 주세요.");
        }
        try {
            LocalDate start = LocalDate.parse(from);
            LocalDate end = LocalDate.parse(to);
            long days = ChronoUnit.DAYS.between(start, end) + 1;
            if (days < 1 || days > MAX_DAYS || end.isAfter(today)) {
                throw new InvalidRequestException("미래를 제외한 1~31일 범위를 지정해 주세요.");
            }
            return new Range(start, end);
        } catch (DateTimeParseException ex) {
            throw new InvalidRequestException("날짜는 YYYY-MM-DD 형식이어야 합니다.");
        }
    }

    public Map<String, Object> context(String from, String to) {
        new OrbitQueryGuard(db, currentUser).check("diet_measurements");
        Range range = range(from, to, LocalDate.now(AppTimeZone.ZONE));
        List<Reading> readings = db.query(
                """
                select entry_date, measured_at, metric, slot, value, unit
                from diet_measurements
                where owner_id = ?
                  and deleted_at is null
                  and entry_date between ? and ?
                  and metric in ('weight', 'glucose', 'bloodKetone', 'breathKetone')
                order by entry_date asc, measured_at asc nulls first, id asc
                """,
                (rs, ignored) -> new Reading(
                        rs.getObject("entry_date", LocalDate.class),
                        AppTimeZone.toDisplay(rs.getObject("measured_at", OffsetDateTime.class)),
                        rs.getString("metric"),
                        rs.getString("slot"),
                        rs.getDouble("value"),
                        rs.getString("unit")),
                currentUser.getCurrentUserId(),
                range.from(),
                range.to());
        return summarize(range, readings);
    }

    static Map<String, Object> summarize(Range range, List<Reading> readings) {
        Map<String, Object> metrics = new LinkedHashMap<>();
        for (String metric : List.of("weight", "glucose", "bloodKetone", "breathKetone")) {
            List<Reading> matching = readings.stream()
                    .filter(reading -> metric.equals(reading.metric()))
                    .toList();
            Set<LocalDate> recordedDays = new LinkedHashSet<>();
            double total = 0;
            for (Reading reading : matching) {
                recordedDays.add(reading.date());
                total += reading.value();
            }

            Reading first = matching.isEmpty() ? null : matching.getFirst();
            Reading last = matching.isEmpty() ? null : matching.getLast();
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("unit", UNITS.get(metric));
            summary.put("samples", matching.size());
            summary.put("recordedDays", recordedDays.size());
            summary.put("first", point(first));
            summary.put("last", point(last));
            summary.put("change", first == null ? null : round(last.value() - first.value()));
            summary.put("average", matching.isEmpty() ? null : round(total / matching.size()));
            metrics.put(metric, summary);
        }

        Map<String, Object> period = new LinkedHashMap<>();
        period.put("from", range.from());
        period.put("to", range.to());
        period.put("days", ChronoUnit.DAYS.between(range.from(), range.to()) + 1);
        period.put("timezone", AppTimeZone.ZONE.getId());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schemaVersion", 1);
        result.put("source", "diet_measurements");
        result.put("period", period);
        result.put("hasData", !readings.isEmpty());
        result.put("metrics", metrics);
        result.put("readings", List.copyOf(readings));
        return result;
    }

    private static Map<String, Object> point(Reading reading) {
        if (reading == null) return null;
        Map<String, Object> point = new LinkedHashMap<>();
        point.put("date", reading.date());
        point.put("measuredAt", reading.measuredAt());
        point.put("value", reading.value());
        point.put("slot", reading.slot());
        return point;
    }

    private static double round(double value) {
        return Math.round(value * 100.0) / 100.0;
    }
}
