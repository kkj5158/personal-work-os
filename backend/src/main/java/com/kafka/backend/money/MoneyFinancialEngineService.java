package com.kafka.backend.money;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.OptimisticLockConflictException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import static com.kafka.backend.money.MoneyService.require;
import static com.kafka.backend.money.MoneyTypes.*;

@Service
public class MoneyFinancialEngineService {
    private static final String VERSION = MoneyFinancialEvidence.VERSION;
    private static final int SHADOW_MAX = 1_000;
    private static final int BATCH_MAX = 25;
    private static final Set<String> SIMPLE_TYPES = Set.of("EXPENSE", "INCOME");
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json;
    private final MoneyService money;
    private final MoneyAccountLedgerService ledger;
    private final MoneyCommandService commands;
    private final Environment environment;

    public MoneyFinancialEngineService(JdbcTemplate db, CurrentUserProvider users, ObjectMapper json, MoneyService money,
            MoneyAccountLedgerService ledger, MoneyCommandService commands, Environment environment) {
        this.db = db;
        this.users = users;
        this.json = json;
        this.money = money;
        this.ledger = ledger;
        this.commands = commands;
        this.environment = environment;
    }

    public record Candidate(UUID id, long version, String occurredAt, String currency, BigDecimal amount,
            String currentType, String proposedType, String decision, String reason, Map<String, Object> evidence) {}
    public record RuleInput(UUID requestId, UUID basisId, Long expectedBasisVersion, Long expectedRuleVersion, Boolean active) {}
    public record Target(UUID id, Long expectedVersion, String type) {}
    public record BatchInput(List<Target> items) {}
    public record BatchExecute(UUID requestId, UUID previewId, String fingerprint, boolean confirmed) {}
    private record ApprovedEdit(UUID id, MoneyAccountLedgerService.EditRequest draft) {}
    private record BatchSnapshot(String engineVersion, List<ApprovedEdit> edits, List<Candidate> items) {}
    private record StoredBatch(String fingerprint, BatchSnapshot snapshot, boolean fresh) {}

    private UUID owner() {
        return users.getCurrentUserId();
    }

    private void lock() {
        db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))", Object.class, "money:" + owner());
    }

    static boolean autoEnabled(Environment environment) {
        return environment.acceptsProfiles(Profiles.of("(dev | hosted-dev) & !prod"))
                && "DEV".equals(environment.getProperty("app.db-environment"))
                && environment.getProperty("app.money.financial-engine-auto-confirm", Boolean.class, false);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> status() {
        long unresolved = unresolvedCount();
        var results = db.queryForList("""
                select action,count(*) as count from money_meaning_audit where user_id=?
                   and action in ('FINANCIAL_ENGINE_OWNER_CONFIRM','FINANCIAL_ENGINE_AUTO_CONFIRM')
                   group by action order by action
                """, owner());
        var outcomes = db.queryForList("""
                select command, status, coalesce(result->>'reason','APPLIED') as reason,count(*) as count
                  from money_command_outcomes where user_id=?
                   and command in ('ACCOUNT_LEDGER_QUICK_CONFIRM','FINANCIAL_ENGINE_BATCH',
                                   'FINANCIAL_ENGINE_QUICK_CONFIRM','FINANCIAL_ENGINE_RULE')
                 group by command,status,result->>'reason' order by command,status,reason
                """, owner());
        return Map.of("policy", "EVIDENCE_FIRST", "engineVersion", VERSION, "autoConfirmEnabled", autoEnabled(environment),
                "unresolvedCount", unresolved, "shadowLimit", SHADOW_MAX, "batchLimit", BATCH_MAX,
                "decisionTotals", results, "commandOutcomes", outcomes);
    }

    private long unresolvedCount() {
        return Objects.requireNonNull(db.queryForObject("""
                select count(*) from money_transactions where user_id=? and not excluded
                   and merged_into is null and meaning_state='UNRESOLVED'
                """, Long.class, owner()));
    }

    private List<UUID> openRows(int limit, int offset) {
        return db.queryForList("""
                select id from money_transactions where user_id=? and not excluded
                   and merged_into is null and meaning_state='UNRESOLVED'
                 order by occurred_at desc,id limit ? offset ?
                """, UUID.class, owner(), limit, offset);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> candidates(int limit, int offset) {
        page(limit, offset);
        var accounts = money.accounts();
        var items = openRows(limit, offset).stream().map(money::transaction).map(f -> classify(f, accounts)).toList();
        return Map.of("engineVersion", VERSION, "total", unresolvedCount(), "items", items);
    }

    Candidate classify(MoneyTransaction fact, List<MoneyAccount> accounts) {
        if (MoneyFinancialEvidence.ownerProtected(db, owner(), fact.id())) {
            return decision(fact, null, "REVIEW_REQUIRED", "OWNER_DECISION_PROTECTED", Map.of());
        }
        if (fact.excluded() || fact.mergedInto() != null || !"UNRESOLVED".equals(fact.meaningState())) {
            return decision(fact, null, "REVIEW_REQUIRED", "INACTIVE_OR_CONFIRMED", Map.of());
        }
        if (fact.refundOf() != null || !SIMPLE_TYPES.contains(fact.type().name()) || fact.transferDestinationStatus() != null) {
            return decision(fact, null, "REVIEW_REQUIRED", "CANONICAL_FINANCIAL_REVIEW_REQUIRED", Map.of());
        }
        var transfer = MoneyFinancialEvidence.transfer(db, owner(), money, fact, accounts);
        if (transfer != null) {
            if (transfer.counterpartId() == null || "TRANSFER_COUNTERPART_PROTECTED".equals(transfer.reason())) {
                return decision(fact, null, "REVIEW_REQUIRED", transfer.reason(), Map.of());
            }
            return decision(fact, "TRANSFER", "PROPOSE_ONLY", transfer.reason(),
                    Map.of("counterpartId", transfer.counterpartId()));
        }
        var proof = MoneyFinancialEvidence.ordinary(db, owner(), money, fact, accounts);
        if (proof == null) {
            return decision(fact, null, "REVIEW_REQUIRED", "SOURCE_INCOMPLETE_OR_CONFLICTED", Map.of());
        }
        var rule = MoneyFinancialEvidence.approvedRule(db, owner(), proof);
        var refs = new LinkedHashMap<String, Object>();
        refs.put("sourceId", proof.rawId());
        refs.put("parseAttemptId", proof.attemptId());
        refs.put("parserVersion", proof.parserVersion());
        refs.put("accountId", proof.accountId());
        refs.put("direction", proof.direction());
        refs.put("provider", proof.provider());
        if (rule == null) {
            return decision(fact, fact.type().name(), "PROPOSE_ONLY", "NO_CURRENT_APPROVED_RULE", refs);
        }
        refs.put("ruleId", rule.id());
        refs.put("ruleVersion", rule.version());
        return decision(fact, fact.type().name(), "AUTO_CONFIRM_ELIGIBLE", "EXACT_OWNER_RULE_AND_SOURCE", refs);
    }

    private Candidate decision(MoneyTransaction fact, String proposedType, String decision, String reason,
            Map<String, Object> evidence) {
        return new Candidate(fact.id(), fact.version(), fact.occurredAt().toString(), fact.currency(), fact.amount(),
                fact.type().name(), proposedType, decision, reason, evidence);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> history(UUID id) {
        money.transaction(id);
        var items = db.queryForList("""
                select id,action,created_at as "createdAt", next_value->>'origin' as origin,
                       next_value->>'type' as type, next_value->>'engineVersion' as "engineVersion",
                       next_value->>'requestId' as "requestId"
                  from money_meaning_audit where user_id=? and subject_id=?
                 order by created_at desc,id desc limit 100
                """, owner(), id);
        return Map.of("engineVersion", VERSION, "items", items);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> rules() {
        return Map.of("items", db.queryForList("""
                select id,account_id as "accountId",provider,merchant_key as "merchantKey",direction,
                       basis_id as "basisId",basis_version as "basisVersion",active,version
                  from money_financial_rules where user_id=? order by updated_at desc,id limit 100
                """, owner()));
    }

    public Map<String, Object> saveRule(RuleInput input) {
        require(input != null && input.basisId() != null && input.expectedBasisVersion() != null
                && input.expectedRuleVersion() != null && input.active() != null,
                "규칙 거래와 두 버전이 필요합니다.");
        return commands.execute(owner(), input.requestId(), "FINANCIAL_ENGINE_RULE", input, () -> {
            var basis = money.transaction(input.basisId());
            MoneyMeaningService.version(basis.version(), input.expectedBasisVersion());
            var proof = MoneyFinancialEvidence.ordinary(db, owner(), money, basis);
            require(proof != null && "CONFIRMED".equals(basis.meaningState()) && Boolean.TRUE.equals(db.queryForObject("""
                    select exists(select 1 from money_meaning_audit where user_id=? and subject_id=?
                      and action='FINANCIAL_ENGINE_OWNER_CONFIRM' and next_value->>'version'=?)
                    """, Boolean.class, owner(), basis.id(), Long.toString(basis.version()))),
                    "거래장에서 직접 확정한 최신 소비·수입 근거가 필요합니다.");
            var existing = db.queryForList("""
                    select id,version from money_financial_rules where user_id=? and account_id=? and provider=?
                       and merchant_key=? and direction=?
                    """, owner(), proof.accountId(), proof.provider(), proof.merchantKey(), proof.direction().name());
            long version = existing.isEmpty() ? 0 : ((Number) existing.getFirst().get("version")).longValue();
            MoneyMeaningService.version(version, input.expectedRuleVersion());
            UUID id = existing.isEmpty() ? UUID.randomUUID() : (UUID) existing.getFirst().get("id");
            db.update("""
                    insert into money_financial_rules(id,user_id,account_id,provider,merchant_key,direction,basis_id,basis_version,active)
                    values(?,?,?,?,?,?,?,?,?) on conflict(id) do update set basis_id=excluded.basis_id,
                     basis_version=excluded.basis_version,active=excluded.active,version=money_financial_rules.version+1,updated_at=now()
                    """, id, owner(), proof.accountId(), proof.provider(), proof.merchantKey(), proof.direction().name(),
                    basis.id(), basis.version(), input.active());
            new MoneyMeaningService(db, users, json).audit(id, "FINANCIAL_RULE_OWNER", Map.of("version", version),
                    Map.of("origin", "OWNER", "basisId", basis.id(), "active", input.active(),
                           "version", version + 1, "requestId", input.requestId()));
            return Map.of("id", id, "version", version + 1, "active", input.active());
        });
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> backfillPreview(int limit, int offset) {
        page(limit, offset);
        return shadowPage(null, snapshot(), limit, offset);
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> shadow(UUID requestId) {
        require(requestId != null, "Shadow 요청 ID가 필요합니다.");
        var existing = db.queryForList("select snapshot::text from money_financial_shadow_runs where user_id=? and id=?",
                String.class, owner(), requestId);
        if (existing.isEmpty()) {
            var snapshot = snapshot();
            db.update("""
                    insert into money_financial_shadow_runs(user_id,id,fingerprint,snapshot) values(?,?,?,cast(? as jsonb))
                      on conflict do nothing
                    """, owner(), requestId, snapshot.get("fingerprint"), json.writeValueAsString(snapshot));
        }
        return shadowRun(requestId, 1, 0);
    }

    private Map<String, Object> snapshot() {
        long total = unresolvedCount();
        var accounts = money.accounts();
        var items = openRows(SHADOW_MAX, 0).stream().map(money::transaction).map(f -> classify(f, accounts)).toList();
        var groups = new TreeMap<String, Long>();
        var reasons = new TreeMap<String, Long>();
        var proposedTotals = new TreeMap<String, BigDecimal>();
        var trackedTotals = new TreeMap<String, BigDecimal>();
        var tracked = new HashSet<>(db.queryForList("""
                select k.account_id::text || ':' || k.kind from money_tracking_accounts k join money_accounts a
                   on a.user_id=k.user_id and a.id=k.account_id where k.user_id=? and not a.archived
                   and coalesce(a.include_in_statistics,true)
                """, String.class, owner()));
        for (var item : items) {
            groups.merge(item.decision(), 1L, Long::sum);
            reasons.merge(item.reason(), 1L, Long::sum);
            if (SIMPLE_TYPES.contains(Objects.toString(item.proposedType(), ""))) {
                String key = item.currency() + "_" + item.proposedType();
                proposedTotals.merge(key, item.amount(), BigDecimal::add);
                if (tracked.contains(item.evidence().get("accountId") + ":" + item.proposedType())) {
                    trackedTotals.merge(key, item.amount(), BigDecimal::add);
                }
            }
        }
        return Map.ofEntries(Map.entry("engineVersion", VERSION),
                Map.entry("fingerprint", commands.fingerprint(List.of(VERSION, total, items, trackedTotals))),
                Map.entry("total", total), Map.entry("evaluated", items.size()), Map.entry("truncated", total > items.size()),
                Map.entry("distribution", groups), Map.entry("reasons", reasons),
                Map.entry("projectedGrossByCurrencyAndType", proposedTotals),
                Map.entry("projectedTrackedGrossByCurrencyAndType", trackedTotals),
                Map.entry("cashDelta", BigDecimal.ZERO), Map.entry("items", items));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> shadowRun(UUID id, int limit, int offset) {
        page(limit, offset);
        var rows = db.queryForList("""
                select snapshot::text from money_financial_shadow_runs where user_id=? and id=?
                """, String.class, owner(), id);
        if (rows.isEmpty()) throw new ResourceNotFoundException("Shadow 실행을 찾을 수 없습니다.");
        return shadowPage(id, json.readerForMapOf(Object.class).readValue(rows.getFirst()), limit, offset);
    }

    private Map<String, Object> shadowPage(UUID id, Map<String, Object> source, int limit, int offset) {
        var snapshot = new LinkedHashMap<>(source);
        var items = (List<?>) snapshot.get("items");
        snapshot.put("items", items.subList(Math.min(offset, items.size()), Math.min(offset + limit, items.size())));
        if (id != null) snapshot.put("id", id);
        return snapshot;
    }

    @Transactional
    public Map<String, Object> batchPreview(BatchInput input) {
        require(input != null && input.items() != null && !input.items().isEmpty() && input.items().size() <= BATCH_MAX,
                "정확한 거래를 1~25개 선택하세요.");
        lock();
        UUID previewId = UUID.randomUUID();
        var ids = new HashSet<UUID>();
        var items = new ArrayList<Candidate>();
        var edits = new ArrayList<ApprovedEdit>();
        var accounts = money.accounts();
        for (var target : input.items()) {
            require(target != null && target.id() != null && ids.add(target.id()), "중복 없는 거래 ID가 필요합니다.");
            var fact = money.transaction(target.id());
            MoneyMeaningService.version(fact.version(), target.expectedVersion());
            var candidate = classify(fact, accounts);
            require(candidate.proposedType() != null && candidate.proposedType().equals(target.type())
                    && SIMPLE_TYPES.contains(target.type()), "보호·충돌·연결 거래는 일괄 확정할 수 없습니다.");
            var edit = MoneyAccountLedgerService.quickEdit(
                    UUID.nameUUIDFromBytes((previewId + ":" + fact.id()).getBytes(StandardCharsets.UTF_8)), fact, "QUICK_CONFIRM");
            var draft = new MoneyAccountLedgerService.EditRequest(ledger.row(fact.id()).get("fingerprint").toString(), edit);
            var preview = ledger.preview(fact.id(), draft);
            require("APPLIED".equals(preview.get("status")), "금융 거래 미리보기 검증에 실패했습니다.");
            edits.add(new ApprovedEdit(fact.id(), new MoneyAccountLedgerService.EditRequest(
                    draft.fingerprint(), edit, preview.get("previewToken").toString())));
            items.add(candidate);
        }
        var snapshot = new BatchSnapshot(VERSION, edits, items);
        String fingerprint = commands.fingerprint(snapshot);
        db.update("""
                insert into money_financial_batch_previews(user_id,id,fingerprint,snapshot,expires_at)
                   values(?,?,?,cast(? as jsonb),now()+interval '10 minutes')
                """, owner(), previewId, fingerprint, json.writeValueAsString(snapshot));
        return Map.of("previewId", previewId, "fingerprint", fingerprint, "engineVersion", VERSION,
                "items", items, "approvalRequired", true, "expiresInSeconds", 600, "cashDelta", BigDecimal.ZERO);
    }

    public Map<String, Object> batchExecute(BatchExecute input) {
        return execute(input, BATCH_MAX, "FINANCIAL_ENGINE_BATCH");
    }

    public Map<String, Object> quickConfirm(BatchExecute input) {
        return execute(input, 1, "FINANCIAL_ENGINE_QUICK_CONFIRM");
    }

    private Map<String, Object> execute(BatchExecute input, int maxItems, String command) {
        require(input != null && input.previewId() != null && input.fingerprint() != null && input.confirmed(),
                "정확한 일괄 미리보기와 사용자 확인이 필요합니다.");
        return commands.execute(owner(), input.requestId(), command, input, () -> {
            var rows = db.query("""
                    select fingerprint,snapshot::text,expires_at>clock_timestamp() as fresh
                      from money_financial_batch_previews where user_id=? and id=?
                    """, (rs, n) -> new StoredBatch(rs.getString("fingerprint"),
                            json.readValue(rs.getString("snapshot"), BatchSnapshot.class), rs.getBoolean("fresh")),
                    owner(), input.previewId());
            if (rows.isEmpty()) throw new ResourceNotFoundException("일괄 미리보기를 찾을 수 없습니다.");
            var stored = rows.getFirst();
            require(stored.snapshot().items().size() <= maxItems, "빠른 확정은 거래 한 건만 지원합니다.");
            require(stored.fresh() && stored.fingerprint().equals(input.fingerprint())
                    && VERSION.equals(stored.snapshot().engineVersion()), "만료되었거나 변경된 일괄 미리보기입니다.");
            var accounts = money.accounts();
            for (var item : stored.snapshot().items()) {
                var current = classify(money.transaction(item.id()), accounts);
                if (!Boolean.TRUE.equals(db.queryForObject("select cast(? as jsonb)=cast(? as jsonb)", Boolean.class,
                        json.writeValueAsString(item), json.writeValueAsString(current)))) {
                    throw new OptimisticLockConflictException("일괄 미리보기의 거래 또는 규칙 근거가 변경되었습니다.");
                }
            }
            for (var edit : stored.snapshot().edits()) {
                if (!"APPLIED".equals(ledger.execute(edit.id(), edit.draft()).get("status"))) {
                    throw new OptimisticLockConflictException("거래 근거가 바뀌어 일괄 변경 전체를 취소했습니다.");
                }
            }
            db.update("update money_financial_batch_previews set expires_at=clock_timestamp() where user_id=? and id=?",
                    owner(), input.previewId());
            return Map.of("appliedIds", stored.snapshot().items().stream().map(Candidate::id).toList(), "cashDelta", BigDecimal.ZERO);
        });
    }

    private void page(int limit, int offset) {
        require(limit > 0 && limit <= 100 && offset >= 0 && offset <= 100_000, "페이지 범위를 확인하세요.");
    }

    /** Called synchronously only for the newly inserted transaction inside the processing owner lock. */
    static void autoConfirmNew(JdbcTemplate db, ObjectMapper json, MoneyService money, UUID owner,
            UUID transactionId, Instant now) {
        var fact = money.transaction(transactionId);
        var accounts = money.accounts();
        var proof = MoneyFinancialEvidence.ordinary(db, owner, money, fact, accounts);
        if (proof == null || !"UNRESOLVED".equals(fact.meaningState())
                || fact.occurredAt().isBefore(now.minus(Duration.ofMinutes(5)))
                || fact.occurredAt().isAfter(now)
                || money.notification(proof.rawId()).receivedAt().isBefore(now.minus(Duration.ofMinutes(5)))
                || MoneyFinancialEvidence.ownerProtected(db, owner, fact.id())
                || MoneyFinancialEvidence.transfer(db, owner, money, fact, accounts) != null) return;
        var rule = MoneyFinancialEvidence.approvedRule(db, owner, proof);
        if (rule == null) return;
        int changed = db.update("""
                update money_transactions set meaning_state='CONFIRMED',version=version+1
                   where user_id=? and id=? and version=? and meaning_state='UNRESOLVED'
                """, owner, fact.id(), fact.version());
        if (changed != 1) throw new OptimisticLockConflictException("새 거래의 금융 의미가 변경되었습니다.");
        if (fact.type() == TransactionType.EXPENSE) money.applyCategoryRule(fact.id());
        money.applyMeaningRules(fact.id());
        new MoneyMeaningService(db, () -> owner, json).audit(fact.id(), "FINANCIAL_ENGINE_AUTO_CONFIRM",
                Map.of("version", fact.version()), Map.of("origin", "AUTO", "type", fact.type(),
                        "version", fact.version() + 1, "engineVersion", VERSION, "proof", proof, "rule", rule));
    }
}
