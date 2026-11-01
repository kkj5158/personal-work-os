package com.kafka.backend.orbit;

import com.kafka.backend.calendar.CalendarService;
import com.kafka.backend.checklistsys.ChecklistSysService;
import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.diet.DietService;
import com.kafka.backend.money.MoneyCalendarService;
import com.kafka.backend.money.MoneyProductService;
import com.kafka.backend.money.MoneySavingsReadService;
import com.kafka.backend.money.MoneyTypes.MoneyAccount;
import com.kafka.backend.money.MoneyTypes.MoneyTransaction;
import com.kafka.backend.money.MoneyWebService;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryService;
import com.kafka.backend.workflow.WorkflowOrbitReadService;
import com.kafka.backend.workflow.WorkflowProjectionService;
import com.kafka.backend.workflow.WorkflowService;
import com.kafka.backend.workrecord.WorkRecord;
import com.kafka.backend.workrecord.WorkRecordResponse;
import com.kafka.backend.workrecord.WorkRecordService;
import com.kafka.backend.worktimeentry.WorkTimeEntryService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * ORBIT V1 bounded, read-only context projections. No DB credentials,
 * user IDs, mutable actions, diagnosis, generated summaries or invented facts.
 */
@Service
@Transactional(readOnly = true)
public class OrbitReadService {
    static final int MAX_PERIOD_DAYS = 31;
    private final DietService diet;
    private final CalendarService calendar;
    private final WorkRecordService workRecords;
    private final WorkTimeEntryService workTimeEntries;
    private final SupplementalWorkEntryService supplementalEntries;
    private final ChecklistSysService checklist;
    private final WorkflowService workflow;
    private final WorkflowOrbitReadService workflowRead;
    private final WorkflowProjectionService workflowProjection;
    private final MoneyWebService moneyWeb;
    private final MoneyProductService moneyProduct;
    private final MoneySavingsReadService savings;
    private final MoneyCalendarService earnings;

    public OrbitReadService(
            DietService diet,
            CalendarService calendar,
            WorkRecordService workRecords,
            WorkTimeEntryService workTimeEntries,
            SupplementalWorkEntryService supplementalEntries,
            ChecklistSysService checklist,
            WorkflowService workflow,
            WorkflowOrbitReadService workflowRead,
            WorkflowProjectionService workflowProjection,
            MoneyWebService moneyWeb,
            MoneyProductService moneyProduct,
            MoneySavingsReadService savings,
            MoneyCalendarService earnings) {
        this.diet = diet;
        this.calendar = calendar;
        this.workRecords = workRecords;
        this.workTimeEntries = workTimeEntries;
        this.supplementalEntries = supplementalEntries;
        this.checklist = checklist;
        this.workflow = workflow;
        this.workflowRead = workflowRead;
        this.workflowProjection = workflowProjection;
        this.moneyWeb = moneyWeb;
        this.moneyProduct = moneyProduct;
        this.savings = savings;
        this.earnings = earnings;
    }

    record Period(LocalDate from, LocalDate to) {}

    static Period period(String from, String to, LocalDate today) {
        if (from == null && to == null) return new Period(today.minusDays(13), today);
        if (from == null || to == null || from.isBlank() || to.isBlank()) {
            throw new InvalidRequestException("from과 to를 함께 지정해 주세요.");
        }
        try {
            LocalDate start = LocalDate.parse(from);
            LocalDate end = LocalDate.parse(to);
            long days = ChronoUnit.DAYS.between(start, end) + 1;
            if (days < 1 || days > MAX_PERIOD_DAYS || end.isAfter(today)) {
                throw new InvalidRequestException("미래를 제외한 1~31일 기간을 지정해 주세요.");
            }
            return new Period(start, end);
        } catch (DateTimeParseException ex) {
            throw new InvalidRequestException("날짜 형식은 YYYY-MM-DD입니다.");
        }
    }

    /** Calendar intentions may be in the future; factual histories may not. */
    static Period planningPeriod(String from, String to, LocalDate today) {
        if (from == null && to == null) return new Period(today, today.plusDays(13));
        if (from == null || to == null || from.isBlank() || to.isBlank()) {
            throw new InvalidRequestException("from과 to를 함께 지정해 주세요.");
        }
        try {
            LocalDate start = LocalDate.parse(from);
            LocalDate end = LocalDate.parse(to);
            long days = ChronoUnit.DAYS.between(start, end) + 1;
            if (days < 1 || days > MAX_PERIOD_DAYS ||
                    start.isBefore(today.minusDays(365)) ||
                    end.isAfter(today.plusDays(31))) {
                throw new InvalidRequestException("계획 조회는 과거 365일~향후 31일, 기간은 1~31일입니다.");
            }
            return new Period(start, end);
        } catch (DateTimeParseException ex) {
            throw new InvalidRequestException("날짜 형식은 YYYY-MM-DD입니다.");
        }
    }

    static int limit(int value) {
        if (value < 1 || value > 100) throw new InvalidRequestException("limit는 1~100입니다.");
        return value;
    }

    static int offset(int value) {
        if (value < 0 || value > 10000) throw new InvalidRequestException("offset은 0~10000입니다.");
        return value;
    }

    static <T> List<T> slice(List<T> rows, int limit, int offset) {
        return rows.subList(Math.min(offset, rows.size()), Math.min(rows.size(), offset + limit));
    }

    private static LocalDate today() {
        return LocalDate.now(AppTimeZone.ZONE);
    }

    private static Period dates(String from, String to) {
        return period(from, to, today());
    }

    private static Map<String, Object> fields(Object... values) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i += 2) {
            result.put((String) values[i], values[i + 1]);
        }
        return result;
    }

    private static Map<String, Object> payload(String kind, Object data, Object... extra) {
        Map<String, Object> result = fields("schemaVersion", 1,
                "context", kind,
                "timezone", AppTimeZone.ZONE.getId(),
                "generatedAt", Instant.now().toString(),
                "data", data);
        result.putAll(fields(extra));
        return result;
    }

    private static Map<String, Object> periodData(Period period) {
        return fields("from", period.from(), "to", period.to(),
                "days", ChronoUnit.DAYS.between(period.from(), period.to()) + 1);
    }

    public Map<String, Object> dietDaily(String from, String to) {
        Period p = dates(from, to);
        var data = diet.dataRange(p.from(), p.to());
        return payload("diet.daily", data.days(), "period", periodData(p),
                "recordedDays", data.days().size(),
                "note", "Only explicitly recorded daily facts. Missing days are unknown.");
    }

    public Map<String, Object> dietProgress(String from, String to) {
        Period p = dates(from, to);
        var data = diet.dataRange(p.from(), p.to());
        return payload("diet.progress", fields(
                "items", data.items(),
                "checks", data.checks(),
                "challenges", data.challenges(),
                "goals", data.goals(),
                "milestones", data.milestones().stream()
                        .filter(m -> !m.date().isBefore(p.from()) && !m.date().isAfter(p.to())).toList(),
                "archivePeriods", data.archivePeriods()),
                "period", periodData(p),
                "note", "Checks are explicit states. Absence is not FAIL; archived intervals are excluded from implied adherence.");
    }

    public Map<String, Object> calendar(String from, String to) {
        Period p = planningPeriod(from, to, today());
        return payload("calendar.range", calendar.findInRange(p.from(), p.to()),
                "period", periodData(p),
                "note", "Planned and actual calendar facts retain their canonical meanings.");
    }

    public Map<String, Object> workRecords(String from, String to) {
        Period p = dates(from, to);
        List<WorkRecord> records = workRecords.listInRange(p.from(), p.to());
        List<UUID> ids = records.stream().map(WorkRecord::getId).toList();
        var actual = workTimeEntries.findByWorkRecordIds(ids);
        var supplemental = supplementalEntries.findByWorkRecordIds(ids);
        List<WorkRecordResponse> result = records.stream()
                .map(record -> WorkRecordResponse.from(record,
                        actual.getOrDefault(record.getId(), List.of()),
                        supplemental.getOrDefault(record.getId(), List.of()))).toList();
        return payload("work.records", result, "period", periodData(p),
                "recordedDays", result.size());
    }

    public Map<String, Object> checklistCatalog() {
        return payload("checklist.catalog", checklist.catalog(),
                "note", "Archive periods and item start dates determine valid recording windows.");
    }

    public Map<String, Object> checklistRecords(String from, String to) {
        Period p = dates(from, to);
        var records = checklist.records(p.from(), p.to());
        return payload("checklist.records", records, "period", periodData(p),
                "recordCount", records.size(),
                "note", "No record means untouched; do not infer completion or failure.");
    }

    public Map<String, Object> workflowProjects(String status, int pageSize, int pageOffset) {
        limit(pageSize); offset(pageOffset);
        var page = workflowRead.projects(status, pageSize, pageOffset);
        return payload("workflow.projects", page.items(),
                "total", page.total(), "limit", pageSize, "offset", pageOffset,
                "hasMore", (long) pageOffset + page.items().size() < page.total(),
                "filter", fields("status", status));
    }

    public Map<String, Object> workflowTasks(String status, int pageSize, int pageOffset) {
        limit(pageSize); offset(pageOffset);
        var page = workflowRead.tasks(status, pageSize, pageOffset);
        return payload("workflow.tasks", page.items(),
                "total", page.total(), "limit", pageSize, "offset", pageOffset,
                "hasMore", (long) pageOffset + page.items().size() < page.total(),
                "filter", fields("status", status),
                "note", "Due dates and deadline dates are different fields; do not conflate them.");
    }

    public Map<String, Object> workflowDay(String date) {
        LocalDate day = today();
        if (date != null) {
            try {
                day = LocalDate.parse(date);
            } catch (DateTimeParseException ex) {
                throw new InvalidRequestException("날짜 형식은 YYYY-MM-DD입니다.");
            }
        }
        if (day.isBefore(today().minusDays(365)) || day.isAfter(today().plusDays(31))) {
            throw new InvalidRequestException("조회일은 최근 365일 또는 향후 31일 이내여야 합니다.");
        }
        var record = workflow.day(day);
        return payload("workflow.day", record, "date", day, "blockCount", record.blocks().size());
    }

    public Map<String, Object> workflowPlan(String from, String to) {
        Period p = planningPeriod(from, to, today());
        var plan = workflowProjection.plan(p.from(), p.to());
        return payload("workflow.plan", plan, "period", periodData(p),
                "taskCount", plan.size(),
                "note", "Plan-day assignments are intentions, not confirmed completions.");
    }

    public Map<String, Object> workflowWaiting() {
        LocalDate day = today();
        return payload("workflow.waiting", workflowProjection.waiting(day), "asOf", day);
    }

    public Map<String, Object> moneyOverview(String from, String to) {
        Period p = dates(from, to);
        return payload("money.overview", moneyWeb.overview(p.from().toString(), p.to().toString()),
                "period", periodData(p),
                "note", "Use canonical money domain classifications; transfers and loan principal are not ordinary spending.");
    }

    public Map<String, Object> moneyTransactions(String from, String to, int pageSize, int pageOffset) {
        Period p = dates(from, to);
        limit(pageSize); offset(pageOffset);
        var result = moneyProduct.transactions(p.from().toString(), p.to().toString(),
                null, null, null, null, false, pageSize, pageOffset, false);
        var items = result.items().stream().map(OrbitReadService::safeTransaction).toList();
        return payload("money.transactions", items,
                "period", periodData(p), "limit", pageSize, "offset", pageOffset,
                "total", result.total(), "hasMore", (long) pageOffset + items.size() < result.total(),
                "note", "Excluded transactions are omitted; refund/merge links remain visible and must not be double-counted.");
    }

    private static Map<String, Object> safeTransaction(MoneyTransaction t) {
        return fields("id", t.id(), "type", t.type(),
                "fromAccountId", t.fromAccountId(), "toAccountId", t.toAccountId(),
                "amount", t.amount(), "currency", t.currency(),
                "occurredAt", t.occurredAt(), "counterparty", t.counterpartyText(),
                "title", t.title(), "categoryId", t.categoryId(), "memo", t.memo(),
                "refundOf", t.refundOf(), "mergedInto", t.mergedInto(),
                "manual", t.manual(), "meaningState", t.meaningState(),
                "sourceCount", t.sourceCount());
    }

    public Map<String, Object> moneyAccounts() {
        List<Map<String, Object>> data = new ArrayList<>();
        for (var row : moneyProduct.accountBalances()) {
            MoneyAccount account = (MoneyAccount) row.get("account");
            MoneyProductService.Balance balance = (MoneyProductService.Balance) row.get("balance");
            data.add(fields("id", account.id(),
                    "provider", account.provider(), "name", account.displayName(),
                    "role", account.role(), "archived", account.archived(),
                    "includeInAssets", account.includeInAssets(),
                    "includeInStatistics", account.includeInStatistics(),
                    "fundGroup", account.fundGroup(), "savingsSubtype", account.savingsSubtype(),
                    "balance", balance == null ? null : fields(
                            "amount", balance.amount(), "provenance", balance.provenance(),
                            "asOf", balance.asOf())));
        }
        return payload("money.accounts", data, "accountCount", data.size(),
                "note", "Account references and image payloads are intentionally excluded.");
    }

    public Map<String, Object> moneyLoans() {
        var loans = moneyWeb.loans();
        return payload("money.loans", loans, "loanCount", loans.size(),
                "note", "Remaining principal is the canonical loan balance; never sum repayment transactions as consumer expense.");
    }

    public Map<String, Object> moneySavings(String from, String to, int pageSize, int pageOffset, String currency) {
        Period p = dates(from, to);
        limit(pageSize); offset(pageOffset);
        String selectedCurrency = currency == null ? "KRW" : currency.toUpperCase(Locale.ROOT);
        if (!selectedCurrency.matches("[A-Z]{3}")) throw new InvalidRequestException("통화는 ISO 3자리 코드여야 합니다.");
        return payload("money.savings", savings.read(p.from().toString(), p.to().toString(),
                        null, null, pageSize, pageOffset, selectedCurrency),
                "period", periodData(p), "limit", pageSize, "offset", pageOffset,
                "currency", selectedCurrency,
                "note", "Net savings is not ordinary income or expenditure.");
    }

    public Map<String, Object> moneyEarnings(String month) {
        YearMonth selected;
        try {
            selected = month == null ? YearMonth.now(AppTimeZone.ZONE) : YearMonth.parse(month);
        } catch (DateTimeParseException ex) {
            throw new InvalidRequestException("month는 YYYY-MM 형식이어야 합니다.");
        }
        if (selected.isAfter(YearMonth.now(AppTimeZone.ZONE).plusMonths(3))) {
            throw new InvalidRequestException("3개월 이후의 급여 계획은 조회하지 않습니다.");
        }
        return payload("money.earnings", earnings.earningsCalendar(selected.toString()),
                "month", selected.toString(),
                "note", "Expected, confirmed, and received pay have distinct meanings; weekly allowances follow saved policy.");
    }
}
