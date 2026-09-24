package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;

@Service
@Transactional
public class MoneyService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json;
    public MoneyService(JdbcTemplate db, CurrentUserProvider users, ObjectMapper json) {
        this.db = db; this.users = users; this.json = json;
    }
    private UUID owner() { return users.getCurrentUserId(); }
    private static Instant instant(ResultSet row, String key) throws SQLException { return row.getTimestamp(key).toInstant(); }
    @SuppressWarnings("unchecked")
    private Map<String,Object> object(String value) { return json.readValue(value, Map.class); }
    private static <T> T found(List<T> rows) {
        if (rows.isEmpty()) throw new ResourceNotFoundException("Money record not found");
        return rows.getFirst();
    }
    static void require(boolean condition, String message) { if (!condition) throw new InvalidRequestException(message); }
    static void text(String value, int max, boolean required, String field) {
        require(!required || (value != null && !value.isBlank()), field + " is required");
        require(value == null || value.length() <= max, field + " is too long");
    }
    static void amount(BigDecimal value) {
        require(value != null && value.signum() > 0 && value.stripTrailingZeros().scale() <= 2
                && value.compareTo(new BigDecimal("100000000000000000")) < 0, "Amount must be positive with at most two decimal places");
    }
    private static void changed(int count) {
        if (count != 1) throw new OptimisticLockConflictException("This money record changed. Reload before saving.");
    }
    private static void accountInput(AccountInput input) {
        require(input != null, "Account is required");
        text(input.provider(), 40, true, "Provider");
        require(input.provider().matches("[A-Z][A-Z0-9_]{0,39}"), "Provider must be an uppercase identifier");
        text(input.displayName(), 120, true, "Display name");
        require(input.role() != null, "Account role is required");
        text(input.maskedReference(), 100, false, "Masked reference");
        require(input.maskedReference() == null || (input.maskedReference().contains("*")
                && !input.maskedReference().matches(".*[0-9]{5,}.*")), "Use a masked reference, never a full account number");
        require(input.suffix() == null || input.suffix().matches("[0-9]{1,4}"), "Suffix must contain one to four digits");
    }
    private MoneyAccount accountRow(ResultSet r, int n) throws SQLException {
        return new MoneyAccount(r.getObject("id", UUID.class), r.getString("provider"), r.getString("display_name"),
                AccountRole.valueOf(r.getString("role")), r.getString("masked_reference"), r.getString("suffix"),
                r.getBoolean("archived"), r.getLong("version"));
    }
    @Transactional(readOnly = true)
    public List<MoneyAccount> accounts() {
        return db.query("select * from money_accounts where user_id=? order by created_at,id", this::accountRow, owner());
    }
    @Transactional(readOnly = true)
    public MoneyAccount account(UUID id) {
        return found(db.query("select * from money_accounts where user_id=? and id=?", this::accountRow, owner(), id));
    }
    public MoneyAccount createAccount(AccountInput input) {
        accountInput(input);
        UUID id = UUID.randomUUID();
        db.update("insert into money_accounts(id,user_id,provider,display_name,role,masked_reference,suffix) values(?,?,?,?,?,?,?)",
                id, owner(), input.provider(), input.displayName(), input.role().name(), input.maskedReference(), input.suffix());
        return account(id);
    }
    public MoneyAccount updateAccount(UUID id, AccountUpdate input) {
        account(id);
        require(input != null && input.expectedVersion() != null && input.expectedVersion() >= 0, "Expected version is required");
        accountInput(input.account());
        var a = input.account();
        changed(db.update("update money_accounts set provider=?,display_name=?,role=?,masked_reference=?,suffix=?,version=version+1,updated_at=now() where user_id=? and id=? and version=?",
                a.provider(), a.displayName(), a.role().name(), a.maskedReference(), a.suffix(), owner(), id, input.expectedVersion()));
        return account(id);
    }
    public MoneyAccount archiveAccount(UUID id, ArchiveAccount input) {
        account(id);
        require(input != null && input.expectedVersion() != null && input.expectedVersion() >= 0 && input.archived() != null,
                "Expected version and archive state are required");
        changed(db.update("update money_accounts set archived=?,version=version+1,updated_at=now() where user_id=? and id=? and version=?",
                input.archived(), owner(), id, input.expectedVersion()));
        return account(id);
    }

    private MoneyRawNotification rawRow(ResultSet r, int n) throws SQLException {
        return new MoneyRawNotification(r.getObject("id", UUID.class), r.getString("source_package"), r.getString("notification_key"),
                r.getString("device_id"), r.getString("title"), r.getString("body"), r.getString("big_text"),
                instant(r,"posted_at"), instant(r,"received_at"), object(r.getString("raw_payload")), r.getString("dedupe_key"),
                ProcessingState.valueOf(r.getString("state")), r.getLong("processing_version"), r.getString("processing_reason"));
    }
    @Transactional(readOnly = true)
    public MoneyRawNotification notification(UUID id) {
        return found(db.query("select * from money_raw_notifications where user_id=? and id=?", this::rawRow, owner(), id));
    }
    private MoneyRawNotification lockNotification(UUID id) {
        return found(db.query("select * from money_raw_notifications where user_id=? and id=? for update", this::rawRow, owner(), id));
    }
    static void page(int limit, int offset) { require(limit >= 1 && limit <= 200 && offset >= 0, "Use limit 1..200 and nonnegative offset"); }
    @Transactional(readOnly = true)
    public List<MoneyRawNotification> notifications(ProcessingState state, int limit, int offset) {
        page(limit, offset);
        if (state == null) return db.query("select * from money_raw_notifications where user_id=? order by received_at desc,id limit ? offset ?", this::rawRow, owner(), limit, offset);
        return db.query("select * from money_raw_notifications where user_id=? and state=? order by received_at desc,id limit ? offset ?", this::rawRow, owner(), state.name(), limit, offset);
    }
    private static String field(Map<String,Object> payload, String key, int max, boolean required) {
        Object value = payload.get(key);
        require(value == null || value instanceof String, key + " must be text");
        text((String)value, max, required, key);
        return (String)value;
    }
    private static Object canonical(Object value) {
        if (value instanceof Map<?,?> map) {
            var sorted = new TreeMap<String,Object>();
            map.forEach((k,v) -> sorted.put(k.toString(), canonical(v))); return sorted;
        }
        if (value instanceof List<?> list) return list.stream().map(MoneyService::canonical).toList();
        return value;
    }
    private String hash(Map<String,Object> payload, Instant postedAt) {
        var copy = new LinkedHashMap<>(payload);
        copy.remove("idempotencyKey"); copy.put("postedAt", postedAt.toString());
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(json.writeValueAsString(canonical(copy)).getBytes(StandardCharsets.UTF_8))); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    public IngestResult ingest(Map<String,Object> payload) {
        require(payload != null, "Notification object is required");
        String raw = json.writeValueAsString(payload);
        require(raw.getBytes(StandardCharsets.UTF_8).length <= 131072, "Notification payload exceeds 128 KiB");
        String source = field(payload,"sourcePackage",255,false), key = field(payload,"notificationKey",512,false),
                device = field(payload,"deviceId",255,false), title = field(payload,"title",10000,false),
                body = field(payload,"text",30000,false), big = field(payload,"bigText",60000,false),
                suppliedKey = field(payload,"idempotencyKey",180,false);
        require(List.of(title == null ? "" : title, body == null ? "" : body, big == null ? "" : big)
                .stream().anyMatch(s -> !s.isBlank()), "At least one notification text field is required");
        Instant posted;
        try { posted = Instant.parse(field(payload,"postedAt",60,true)); }
        catch (java.time.DateTimeException e) { throw new InvalidRequestException("postedAt must be an ISO-8601 instant"); }
        String fingerprint = hash(payload, posted);
        String dedupe = suppliedKey == null || suppliedKey.isBlank() ? "sha256:" + fingerprint : "client:" + suppliedKey;
        UUID id = UUID.randomUUID();
        int inserted = db.update("""
                insert into money_raw_notifications(id,user_id,source_package,notification_key,device_id,title,body,big_text,posted_at,raw_payload,dedupe_key,content_hash)
                values(?,?,?,?,?,?,?,?,?,cast(? as jsonb),?,?) on conflict do nothing
                """, id, owner(), source, key, device, title, body, big, Timestamp.from(posted), raw, dedupe, fingerprint);
        var rows = db.query("select * from money_raw_notifications where user_id=? and (dedupe_key=? or content_hash=?) order by received_at,id",
                this::rawRow, owner(), dedupe, fingerprint);
        var saved = found(rows);
        // A reused explicit key must not silently discard a different captured notification.
        if (rows.size() != 1 || !hash(saved.rawPayload(), Instant.parse((String)saved.rawPayload().get("postedAt"))).equals(fingerprint))
            throw new OptimisticLockConflictException("Idempotency key already belongs to a different notification");
        return new IngestResult(inserted == 1, saved);
    }

    private ParseAttempt attemptRow(ResultSet r, int n) throws SQLException {
        String candidate = r.getString("candidate");
        return new ParseAttempt(r.getObject("id",UUID.class), r.getObject("raw_event_id",UUID.class), r.getString("parser_key"),
                r.getString("parser_version"), r.getString("status"), r.getString("failure_code"),
                candidate == null ? null : json.readValue(candidate, ParsedCandidate.class), instant(r,"created_at"));
    }
    @Transactional(readOnly = true)
    public List<ParseAttempt> attempts(UUID rawId) {
        notification(rawId);
        return db.query("select * from money_parse_attempts where user_id=? and raw_event_id=? order by created_at,id", this::attemptRow, owner(), rawId);
    }
    /** Trusted server extension point; parsing exceptions are recorded without logging raw financial text. */
    public ParseAttempt process(UUID rawId, MoneyNotificationParser parser) {
        var raw = lockNotification(rawId);
        require(parser != null, "Parser is required");
        String key = parser.key(), version = parser.version();
        text(key,100,true,"Parser key"); text(version,60,true,"Parser version");
        ParsedCandidate candidate = null;
        String status, failure = null;
        try {
            if (!parser.supports(raw)) {
                candidate = new ParsedCandidate(rawId,null,null,null,null,null,null,null,List.of(),null,null,"UNSUPPORTED",ParseStatus.REVIEW_REQUIRED);
            } else {
                candidate = parser.parse(raw);
                require(candidate != null && rawId.equals(candidate.rawEventId()) && candidate.parseStatus() != null, "Invalid parser result");
                text(candidate.provider(),40,candidate.parseStatus()==ParseStatus.PARSED,"Candidate provider");
                if (candidate.amount() != null || candidate.parseStatus()==ParseStatus.PARSED) amount(candidate.amount());
                require(candidate.parseStatus()!=ParseStatus.PARSED || candidate.direction()!=null, "Parsed direction is required");
            }
            status = candidate.parseStatus().name();
        } catch (RuntimeException e) {
            candidate = null; status = "FAILED"; failure = "PARSER_ERROR";
        }
        UUID id = UUID.randomUUID();
        db.update("insert into money_parse_attempts(id,user_id,raw_event_id,parser_key,parser_version,status,failure_code,provider,direction,amount,candidate) values(?,?,?,?,?,?,?,?,?,?,cast(? as jsonb))",
                id,owner(),rawId,key,version,status,failure,candidate==null?null:candidate.provider(),
                candidate==null || candidate.direction()==null?null:candidate.direction().name(), candidate==null?null:candidate.amount(),
                candidate==null?null:json.writeValueAsString(candidate));
        // Reparsing a posted observation cannot un-post or modify its existing ledger entry.
        db.update("update money_raw_notifications set state=case when state='PROCESSED' then state else ? end,processing_version=processing_version+1 where user_id=? and id=?",
                status,owner(),rawId);
        return found(db.query("select * from money_parse_attempts where user_id=? and id=?",this::attemptRow,owner(),id));
    }

    /** Server-only ledger persistence; no public manual transaction mutation API. */
    public MoneyTransaction recordTransaction(TransactionInput input) {
        require(input != null && input.type()!=null && input.occurredAt()!=null, "Type and occurredAt are required");
        amount(input.amount());
        require(input.currency()!=null && input.currency().matches("[A-Z]{3}"), "Currency must be a three-letter code");
        text(input.counterpartyText(),500,false,"Counterparty");
        UUID from=input.fromAccountId(), to=input.toAccountId();
        boolean shape = switch(input.type()) {
            case INCOME -> from==null && to!=null;
            case EXPENSE -> from!=null && to==null;
            case TRANSFER -> from!=null && to!=null && !from.equals(to);
        };
        require(shape,"Transaction accounts do not match its type");
        if (from!=null) require(!account(from).archived(),"Source account is archived");
        if (to!=null) require(!account(to).archived(),"Destination account is archived");
        require(input.sources()!=null && !input.sources().isEmpty() && input.sources().size()<=100, "One to 100 provenance sources are required");
        Set<UUID> seen = new HashSet<>();
        for (var source: input.sources()) {
            require(source!=null && source.rawEventId()!=null && source.relationship()!=null && seen.add(source.rawEventId()), "Invalid or duplicate source");
            require(source.evidence()==null || json.writeValueAsString(source.evidence()).length()<=30000,"Evidence is too large");
        }
        require(input.sources().stream().anyMatch(s -> s.relationship()==SourceRelationship.PRIMARY), "A primary source is required");
        for (UUID id: seen.stream().sorted().toList()) lockNotification(id);
        for (var source: input.sources()) {
            if (source.parseAttemptId()!=null) {
                var attempt=found(db.query("select * from money_parse_attempts where user_id=? and raw_event_id=? and id=?", this::attemptRow,owner(),source.rawEventId(),source.parseAttemptId()));
                require(!"FAILED".equals(attempt.status()),"Failed parse cannot support a ledger transaction");
            }
            if (Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_transaction_sources where user_id=? and raw_event_id=?)",Boolean.class,owner(),source.rawEventId())))
                throw new OptimisticLockConflictException("Notification is already linked to a transaction");
        }
        UUID id=UUID.randomUUID();
        db.update("insert into money_transactions(id,user_id,type,from_account_id,to_account_id,amount,currency,occurred_at,counterparty_text) values(?,?,?,?,?,?,?,?,?)",
                id,owner(),input.type().name(),from,to,input.amount(),input.currency(),Timestamp.from(input.occurredAt()),input.counterpartyText());
        for (var source: input.sources()) {
            db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence) values(?,?,?,?,?,cast(? as jsonb))",
                    id,owner(),source.rawEventId(),source.parseAttemptId(),source.relationship().name(),json.writeValueAsString(source.evidence()==null?Map.of():source.evidence()));
            db.update("update money_raw_notifications set state='PROCESSED',processing_version=processing_version+1 where user_id=? and id=?",owner(),source.rawEventId());
        }
        return transaction(id);
    }
    private List<TransactionSource> sources(UUID id) {
        return db.query("select * from money_transaction_sources where user_id=? and transaction_id=? order by raw_event_id",(r,n) ->
                new TransactionSource(r.getObject("raw_event_id",UUID.class),r.getObject("parse_attempt_id",UUID.class),
                        SourceRelationship.valueOf(r.getString("relationship")),object(r.getString("evidence"))),owner(),id);
    }
    private MoneyTransaction transactionRow(ResultSet r,int n) throws SQLException {
        UUID id=r.getObject("id",UUID.class);
        return new MoneyTransaction(id,TransactionType.valueOf(r.getString("type")),r.getObject("from_account_id",UUID.class),
                r.getObject("to_account_id",UUID.class),r.getBigDecimal("amount"),r.getString("currency"),instant(r,"occurred_at"),r.getString("counterparty_text"),sources(id));
    }
    @Transactional(readOnly=true)
    public MoneyTransaction transaction(UUID id) {
        return found(db.query("select * from money_transactions where user_id=? and id=?",this::transactionRow,owner(),id));
    }
    @Transactional(readOnly=true)
    public List<MoneyTransaction> transactions(int limit,int offset) {
        page(limit,offset);
        return db.query("select * from money_transactions where user_id=? order by occurred_at desc,id limit ? offset ?",this::transactionRow,owner(),limit,offset);
    }

    /** Server-only auxiliary linking. Same owner and raw exclusivity are checked again under locks. */
    public void attachAuxiliary(UUID transactionId, TransactionSource source) {
        var transaction=transaction(transactionId);
        require(source.relationship()==SourceRelationship.AUXILIARY && source.parseAttemptId()!=null,"Auxiliary parse evidence is required");
        lockNotification(source.rawEventId());
        var attempt=found(db.query("select * from money_parse_attempts where user_id=? and raw_event_id=? and id=? and status='PARSED'",
                this::attemptRow,owner(),source.rawEventId(),source.parseAttemptId()));
        require("SAVINGS_SUCCESS".equals(attempt.candidate().notificationSubtype()),"Unsupported auxiliary subtype");
        var candidate=attempt.candidate();
        var destination=new MoneyAccountResolver().resolve(accounts(),candidate.provider(),candidate.destinationAccountHint());
        require(destination.resolved()&&destination.account().id().equals(transaction.toAccountId())
                &&transaction.type()==TransactionType.TRANSFER&&"KRW".equals(transaction.currency())
                &&"KAKAO".equals(candidate.provider())&&transaction.amount().compareTo(candidate.amount())==0
                &&java.time.Duration.between(transaction.occurredAt(),candidate.occurredAt()).abs().compareTo(VerifiedMoneyTransferMatcher.POST_WINDOW)<=0
                &&transaction.sources().stream().anyMatch(s->s.relationship()==SourceRelationship.PRIMARY
                    &&"EXPLICIT_SINGLE_RAW_ROUTE".equals(s.evidence().get("rule"))),"Auxiliary evidence does not match the transaction");
        var existing=db.queryForList("select transaction_id from money_transaction_sources where user_id=? and raw_event_id=?",UUID.class,owner(),source.rawEventId());
        if(!existing.isEmpty()){
            require(existing.getFirst().equals(transactionId),"Source already linked elsewhere");return;
        }
        db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence) values(?,?,?,?, 'AUXILIARY',cast(? as jsonb))",
                transactionId,owner(),source.rawEventId(),source.parseAttemptId(),json.writeValueAsString(source.evidence()));
        finishProcessing(source.rawEventId(),ProcessingState.PROCESSED,"AUXILIARY_LINKED");
    }
    List<MoneyRawNotification> scheduledNotifications() {
        return db.query("select * from money_raw_notifications where user_id=? and processing_due_at is not null order by received_at,id limit 501",
                this::rawRow,owner());
    }
    List<MoneyTransaction> recentTransactions(Instant since) {
        return db.query("select * from money_transactions where user_id=? and occurred_at>=? order by occurred_at,id limit 501",
                this::transactionRow,owner(),Timestamp.from(since));
    }
    void finishProcessing(UUID rawId,ProcessingState state,String reason) {
        db.update("update money_raw_notifications set state=?,processing_reason=?,processing_due_at=null,processing_version=processing_version+1 where user_id=? and id=?",
                state.name(),reason,owner(),rawId);
    }
    void deferProcessing(UUID rawId,Instant due) {
        db.update("update money_raw_notifications set processing_due_at=? where user_id=? and id=?",Timestamp.from(due),owner(),rawId);
    }
    /** Deliberate owner-scoped retry; posted sources are immutable. No bulk historical backfill. */
    public void requestReprocessing(UUID rawId) {
        var raw=lockNotification(rawId);
        require(raw.state()!=ProcessingState.PROCESSED,"Posted sources cannot be automatically reinterpreted");
        db.update("update money_raw_notifications set state='RECEIVED',processing_reason=null,processing_due_at=now(),processing_version=processing_version+1 where user_id=? and id=?",owner(),rawId);
    }
}
