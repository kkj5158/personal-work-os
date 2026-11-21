package com.kafka.backend.workflow.attention;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import static com.kafka.backend.workflow.attention.AttentionContentTypes.*;
import static com.kafka.backend.workflow.attention.AttentionTypes.*;

@Service
@Transactional
public class AttentionContent {
    static final String SCHEMA = "work-content.v1";
    private static final String PRODUCER = "MANAGED_CODEX";
    private static final long GRANT_SECONDS = 6 * 3600;
    private static final JsonMapper INPUT = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
            .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
            .build();
    private final JdbcTemplate db;
    private final AttentionService queue;
    private final ObjectMapper json;
    private final String environment;
    private final boolean ingest;
    private final boolean render;
    @org.springframework.beans.factory.annotation.Value("${app.attention-content.verifier-key:}")
    private String verifierKey;
    @org.springframework.beans.factory.annotation.Value("${app.attention-content.desktop-capture:false}")
    private boolean desktopCapture;

    public AttentionContent(JdbcTemplate db, AttentionService queue, ObjectMapper json,
                            @Value("${app.db-environment:DEV}") String environment,
                            @Value("${app.attention-content.ingest:false}") boolean ingest,
                            @Value("${app.attention-content.render:false}") boolean render) {
        this.db = db;
        this.queue = queue;
        this.json = json;
        this.environment = environment;
        this.ingest = ingest;
        this.render = render;
    }

    record Target(UUID owner, Grant grant, String title, String request, String key, String reserveHash,
                  Instant createdAt, boolean revoked) {}

    public boolean isDev() { return environment.equals("DEV"); }
    public boolean isRendered() { return render; }
    public boolean isEnabled() { return ingest; }

    private void requireEnabled() {
        if (!ingest) throw rejected(404, "CONTENT_DISABLED");
    }

    private void requireOwner() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof AttentionAuthentication
                || auth instanceof JwtAuthenticationToken jwt && jwt.getTokenAttributes().containsKey("client_id")
                || !isDev() && !(auth instanceof JwtAuthenticationToken)) {
            throw rejected(403, "OWNER_AUTH_REQUIRED");
        }
        // Hosted DEV's security chain still requires a real owner JWT. Local dev uses its standard synthetic owner.
    }

    private void requireDesktop() {
        requireEnabled();
        if (!desktopCapture) throw rejected(404,"DESKTOP_CAPTURE_DISABLED");
    }

    public void authorizeDesktop(DesktopConsent input) {
        requireDesktop();
        requireOwner();
        if (input == null || input.credentialId() == null || input.scopeId() == null)
            throw rejected(400,"INVALID_DESKTOP_SCOPE");
        UUID owner = queue.owner();
        if (db.queryForList("""
                select id from attention_credentials where id=? and user_id=? and kind='DEVICE'
                  and revoked_at is null and (expires_at is null or expires_at>current_timestamp) for share
                """, input.credentialId(), owner).isEmpty()) throw rejected(404,"DEVICE_NOT_FOUND");
        int inserted = db.update("""
                insert into attention_desktop_capture_consents(scope_id,user_id,credential_id,environment)
                values(?,?,?,?) on conflict do nothing
                """,input.scopeId(),owner,input.credentialId(),environment);
        if (inserted == 0 && !Boolean.TRUE.equals(db.queryForObject("""
                select exists(select 1 from attention_desktop_capture_consents
                 where scope_id=? and user_id=? and credential_id=? and environment=? and revoked_at is null)
                """,Boolean.class,input.scopeId(),owner,input.credentialId(),environment)))
            throw rejected(409,"DESKTOP_SCOPE_UNAVAILABLE");
    }

    public void revokeDesktop(UUID scope) {
        requireDesktop();
        requireOwner();
        if (db.update("""
                update attention_desktop_capture_consents set revoked_at=coalesce(revoked_at,current_timestamp)
                 where scope_id=? and user_id=? and environment=?
                """, scope,queue.owner(),environment) != 1) throw rejected(404,"DESKTOP_SCOPE_NOT_FOUND");
    }

    public List<DesktopScope> desktopScopes() {
        requireDesktop();
        requireOwner();
        return db.query("""
                select scope_id,credential_id,created_at from attention_desktop_capture_consents
                 where user_id=? and environment=? and revoked_at is null order by created_at desc
                """,(r,n)->new DesktopScope(r.getObject(1,UUID.class),r.getObject(2,UUID.class),
                r.getTimestamp(3).toInstant()),queue.owner(),environment);
    }

    public void requireDesktopConsent(UUID scope) {
        desktopConsent(scope);
    }

    private Instant desktopConsent(UUID scope) {
        requireDesktop();
        var principal = SecurityContextHolder.getContext().getAuthentication();
        if (!(principal instanceof AttentionAuthentication device) || device.producer())
            throw rejected(403,"DESKTOP_DEVICE_REQUIRED");
        var active = db.query("""
                select s.created_at from attention_desktop_capture_consents s
                 join attention_credentials c on c.id=s.credential_id and c.user_id=s.user_id
                where s.scope_id=? and s.user_id=? and s.credential_id=? and s.environment=?
                  and s.revoked_at is null and c.kind='DEVICE' and c.revoked_at is null
                  and (c.expires_at is null or c.expires_at>current_timestamp) for share of s,c
                """,(r,n)->r.getTimestamp(1).toInstant(),scope,device.ownerId(),device.credentialId(),environment);
        if (active.isEmpty()) throw rejected(403,"DESKTOP_CONSENT_REQUIRED");
        return active.getFirst();
    }

    private static UUID desktopId(String tag, UUID session, String turn) {
        return UUID.nameUUIDFromBytes(("work-queue:desktop:"+tag+":"+session+":"+turn).getBytes(StandardCharsets.UTF_8));
    }

    public DesktopReceipt submitDesktop(byte[] body) {
        requireDesktop();
        var input = read(body,DesktopSubmission.class);
        if (!SCHEMA.equals(input.schemaVersion()) || input.scopeId()==null || input.operationId()==null
                || input.sessionId()==null || input.turnId()==null || !input.turnId().matches("[a-zA-Z0-9_-]{1,100}")
                || input.observation()==null || !Set.of("STOP","WAIT","INTERRUPT").contains(input.observation())
                || input.producedAt()==null || input.expectedContentRevision()<0 || input.expectedContentRevision()>=10)
            throw rejected(400,"INVALID_DESKTOP_REPORT");
        Instant consentedAt = desktopConsent(input.scopeId());
        Instant now = Instant.now();
        if (input.producedAt().isBefore(consentedAt.minusSeconds(5)) || input.producedAt().isAfter(now.plusSeconds(120))
                || input.producedAt().isBefore(now.minusSeconds(29L*86400)))
            throw rejected(409,"DESKTOP_EVENT_OUTSIDE_CONSENT");
        var report = input.report();
        validateReport(report);
        var outcome = report.outcome().state();
        if ("STOP".equals(input.observation())) {
            if ((!input.answerCaptured() && (!"UNKNOWN".equals(outcome) || !report.evidence().isEmpty()))
                    || "CANCELLED".equals(outcome)) throw rejected(400,"INVALID_DESKTOP_OUTCOME");
        } else if (input.answerCaptured() || !report.performed().isEmpty() || !report.evidence().isEmpty()
                || !("WAIT".equals(input.observation()) ? "BLOCKED" : "UNKNOWN").equals(outcome)) {
            throw rejected(400,"INVALID_DESKTOP_OUTCOME");
        }
        UUID owner = queue.owner(), session = input.sessionId();
        String turn = input.turnId(), hash = digest(body);
        UUID logical = desktopId("task",session,turn);
        UUID run = desktopId("run",session,turn);
        queue.lock();
        var candidates = db.queryForList("""
                select item_id,desktop_scope_id from attention_content_targets
                where user_id=? and environment=? and logical_task_id=?
                """,owner,environment,logical);
        String sourceGeneration = digest(("CODEX:"+session+":"+turn+":COMPLETED:"+turn).getBytes(StandardCharsets.US_ASCII));
        Item item;
        if (candidates.isEmpty()) {
            if (input.expectedContentRevision()!=0) throw rejected(409,"CONTENT_REVISION_CONFLICT");
            var source = new Source("CODEX_DESKTOP",session.toString(),null,"MANUAL",
                    "COMPLETED",sourceGeneration,"ACK_ONLY",null,null,null,null);
            item = queue.create(new Create(desktopId("create",session,turn),desktopId("card",session,turn),
                    report.sourceTitle(),null,"Codex",null,source,null)).item();
        } else {
            var bound = candidates.getFirst();
            if (!input.scopeId().equals(bound.get("desktop_scope_id"))) throw rejected(409,"DESKTOP_SCOPE_CHANGED");
            item = queue.itemForOwner(owner,(UUID)bound.get("item_id"));
        }
        if (!"CODEX_DESKTOP".equals(item.source().kind()) || !sourceGeneration.equals(item.source().generation())
                || !session.toString().equals(item.source().reference()) || !"COMPLETED".equals(item.source().intent()))
            throw rejected(409,"REPORT_UNBOUND");
        if ("DISMISSED".equals(item.status())) throw rejected(409,"TARGET_HIDDEN");
        UUID create = desktopId("create",session,turn);
        if (candidates.isEmpty()) {
            if (db.update("""
                    insert into attention_content_targets(item_id,user_id,logical_task_id,run_id,environment,source_key,
                      generation,create_receipt,reserve_hash,approved_title,approved_request,expires_at,desktop_scope_id)
                    values(?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict do nothing
                    """,item.id(),owner,logical,run,environment,item.sourceKey(),run,create,hash,
                    report.sourceTitle(),report.request(),Timestamp.from(now),input.scopeId())!=1)
                throw rejected(409,"REPORT_UNBOUND");
        }
        var grant = new Grant(item.id(),logical,run,environment,item.sourceKey(),run,create,now,hash);
        var target = new Target(owner,grant,report.sourceTitle(),report.request(),null,hash,consentedAt,false);
        var submission = new Submission(SCHEMA,input.operationId(),desktopId("report",session,turn),
                input.expectedContentRevision()+1,input.expectedContentRevision(),logical,run,item.sourceKey(),
                run,create,session,turn,"desktop."+input.observation().toLowerCase(Locale.ROOT),null,input.producedAt(),report);
        var receipt = replay(owner,input.operationId(),item.id(),hash);
        if (receipt == null) receipt = appendReport(target,submission,hash,input);
        return new DesktopReceipt(item.id(),receipt.operationId(),receipt.reportId(),
                receipt.contentRevision(),receipt.bodyHash(),queue.revision());
    }

    public Grant reserve(byte[] body) {
        requireEnabled();
        requireOwner();
        var p = read(body, Proposal.class);
        if (!SCHEMA.equals(p.schemaVersion()) || p.logicalTaskId() == null || p.runId() == null
                || !environment.equals(p.environment())
                || p.sandboxMode() == null || !Set.of("read-only","workspace-write").contains(p.sandboxMode())) throw rejected(400, "INVALID_RESERVATION");
        var title = text(p.title(), 100);
        var request = text(p.request(), 1200);
        key(p.publicKey());
        UUID owner = queue.owner();
        queue.lock();
        String hash = digest(body);
        var existing = db.queryForList("""
                select item_id from attention_content_targets
                where user_id=? and environment=? and (logical_task_id=? or run_id=?)
                """, UUID.class, owner, environment, p.logicalTaskId(), p.runId());
        if (!existing.isEmpty()) {
            var target = target(existing.getFirst());
            if (existing.size() != 1 || !target.reserveHash().equals(hash))
                throw rejected(409, "RESERVATION_CONFLICT");
            if (target.revoked() || !Instant.now().isBefore(target.grant().expiresAt())
                    || queue.itemForOwner(owner, target.grant().itemId()).status().equals("DISMISSED"))
                throw rejected(409, "RESERVATION_INACTIVE");
            return target.grant();
        }

        UUID id = UUID.randomUUID(), receipt = UUID.randomUUID();
        // The exact run exists before launching Codex. The CLI session ID is sealed on first submission.
        var source = new Source("CODEX_DESKTOP", p.logicalTaskId().toString(), null, "MANUAL",
                "MANAGED_CODEX", p.runId().toString(), "ACK_ONLY", null, null, null, title);
        var item = queue.create(new Create(receipt, id, title, p.projectId(), null, null, source, null)).item();
        if (!id.equals(item.id())) throw rejected(409, "SOURCE_ALREADY_BOUND");
        var now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        var expires = now.plusSeconds(GRANT_SECONDS);
        db.update("""
                insert into attention_content_targets(item_id,user_id,logical_task_id,run_id,environment,
                  source_key,generation,create_receipt,reserve_hash,approved_title,approved_request,
                  public_key,created_at,expires_at)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, id, owner, p.logicalTaskId(), p.runId(), environment, item.sourceKey(), p.runId(),
                receipt, hash, title, request, p.publicKey(), Timestamp.from(now), Timestamp.from(expires));
        return new Grant(id,p.logicalTaskId(),p.runId(),environment,item.sourceKey(),p.runId(),receipt,expires,hash);
    }

    public void revoke(UUID id) {
        requireEnabled();
        requireOwner();
        queue.lock();
        int count = db.update("""
                update attention_content_targets set revoked_at=coalesce(revoked_at,current_timestamp)
                where item_id=? and user_id=? and environment=? and public_key is not null
                """, id, queue.owner(), environment);
        if (count == 0) throw rejected(404, "TARGET_NOT_FOUND");
    }

    public Grant checkGrant(UUID id,String signature,byte[] body) {
        requireEnabled();
        var in = read(body,Start.class);
        if (in.operationId()==null) throw rejected(400,"INVALID_START");
        var target=target(id);
        if (!environment.equals(target.grant().environment())) throw rejected(404,"TARGET_NOT_FOUND");
        verify(target,AttentionContentController.startPath(id),in.operationId(),digest(body),signature);
        queue.lockExisting(target.owner());
        target=target(id);
        if (!target.reserveHash().equals(in.proposalHash())) throw rejected(409,"RESERVATION_CONFLICT");
        if (target.revoked() || !Instant.now().isBefore(target.grant().expiresAt()))
            throw rejected(403,"REPORT_GRANT_INACTIVE");
        var item=queue.itemForOwner(target.owner(),id);
        if ("DISMISSED".equals(item.status())) throw rejected(409,"TARGET_HIDDEN");
        return target.grant();
    }

    public Receipt submit(UUID itemId, String signature, byte[] body) {
        requireEnabled();
        var in = read(body, Submission.class);
        if (!SCHEMA.equals(in.schemaVersion()) || in.operationId() == null || in.reportId() == null)
            throw rejected(400, "INVALID_REPORT");
        String hash = digest(body);
        Target t = target(itemId);
        if (!environment.equals(t.grant().environment())) throw rejected(404, "TARGET_NOT_FOUND");
        verify(t, AttentionContentController.reportPath(itemId), in.operationId(), hash, signature);
        // The same owner row lock also serializes hide and owner mutations.
        queue.lockExisting(t.owner());
        t = target(itemId);
        if (t.revoked()) throw rejected(403, "REPORT_GRANT_REVOKED");
        var item = queue.itemForOwner(t.owner(), itemId);
        if (item.status().equals("DISMISSED")) throw rejected(409, "TARGET_HIDDEN");
        Grant g = t.grant();
        if (!item.sourceKey().equals(g.sourceKey()) || !item.source().generation().equals(g.generation().toString())
                || !g.logicalTaskId().equals(in.logicalTaskId()) || !g.runId().equals(in.runId())
                || !g.sourceKey().equals(in.sourceKey()) || !g.generation().equals(in.generation())
                || !g.createReceipt().equals(in.createReceipt()))
            throw rejected(409, "REPORT_UNBOUND");

        if (!Instant.now().isBefore(g.expiresAt())) throw rejected(403, "REPORT_GRANT_EXPIRED");
        var receipt = replay(t.owner(),in.operationId(),itemId,hash);
        if (receipt != null) return receipt;
        validateIdentity(t, in);
        validateReport(in.report());
        return appendReport(t,in,hash,null);
    }

    private Receipt replay(UUID owner, UUID operation, UUID itemId, String hash) {
        var replay = db.query("""
                select item_id,operation_id,report_id,report_revision,content_revision,body_hash,received_at
                from attention_content_reports where user_id=? and operation_id=?
                """, (r,n) -> new Receipt(r.getObject(1,UUID.class),r.getObject(2,UUID.class),r.getObject(3,UUID.class),
                r.getInt(4),r.getInt(5),r.getString(6),r.getTimestamp(7).toInstant()), owner, operation);
        if (!replay.isEmpty()) {
            var receipt = replay.getFirst();
            if (!receipt.itemId().equals(itemId) || !receipt.bodyHash().equals(hash))
                throw rejected(409, "IDEMPOTENCY_MISMATCH");
            return receipt;
        }

        return null;
    }

    private Receipt appendReport(Target t, Submission in, String hash, DesktopSubmission desktop) {
        UUID itemId = t.grant().itemId();
        var prior = db.queryForList("""
                select r.content_revision,r.report_id,r.report_revision,r.session_id,r.turn_id,r.event_id,
                       r.content->>'upstreamTurnId' as upstream_turn_id,
                       r.content->>'requestCaptured' as request_captured,
                       r.content->>'answerCaptured' as answer_captured
                from attention_content_heads h join attention_content_reports r using(item_id,content_revision)
                where h.item_id=?
                """, itemId);
        int current = 0;
        if (!prior.isEmpty()) {
            var head = prior.getFirst();
            current = (int)head.get("content_revision");
            if (!Objects.equals(head.get("session_id"), in.sessionId()) || !head.get("turn_id").equals(in.turnId())
                    || !Objects.equals(head.get("upstream_turn_id"),in.upstreamTurnId())
                    || desktop == null && !head.get("event_id").equals(in.eventId()) || !head.get("report_id").equals(in.reportId()))
                throw rejected(409, "REPORT_UNBOUND");
            if (desktop != null) validateDesktopChange(head,in,desktop);
        }
        if (current >= 10 || in.expectedContentRevision() != current || in.reportRevision() != current + 1)
            throw rejected(409, "CONTENT_REVISION_CONFLICT");

        int next = current + 1;
        var received = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        var full = projection(t, in, next, received, false, desktop);
        var preview = projection(t, in, next, received, true, desktop);
        db.update("""
                insert into attention_content_reports(item_id,user_id,content_revision,report_id,report_revision,
                  operation_id,body_hash,session_id,turn_id,event_id,content,preview,received_at)
                values (?,?,?,?,?,?,?,?,?,?,cast(? as jsonb),cast(? as jsonb),?)
                """, itemId,t.owner(),next,in.reportId(),in.reportRevision(),in.operationId(),hash,in.sessionId(),
                in.turnId(),in.eventId(),json.writeValueAsString(full),json.writeValueAsString(preview),Timestamp.from(received));
        db.update("""
                insert into attention_content_heads(item_id,content_revision) values (?,?)
                on conflict (item_id) do update set content_revision=excluded.content_revision
                """, itemId,next);
        queue.bumpForOwner(t.owner());
        return new Receipt(itemId,in.operationId(),in.reportId(),in.reportRevision(),next,hash,received);
    }

    private static void validateDesktopChange(Map<String,Object> head, Submission in, DesktopSubmission desktop) {
        String oldEvent = (String)head.get("event_id");
        boolean oldRequest = "true".equals(head.get("request_captured"));
        boolean oldAnswer = "true".equals(head.get("answer_captured"));
        boolean terminal = !oldEvent.equals("desktop.wait");
        if (terminal && !oldEvent.equals(in.eventId()) || oldRequest && !desktop.requestCaptured()
                || oldAnswer && !desktop.answerCaptured()
                || oldEvent.equals(in.eventId()) && oldRequest==desktop.requestCaptured() && oldAnswer==desktop.answerCaptured())
            throw rejected(409,"DESKTOP_OBSERVATION_CONFLICT");
    }

    public VerificationReceipt verifyEvidence(UUID itemId,String signature,byte[] body) {
        requireEnabled();
        if (!isDev() || verifierKey==null || verifierKey.isBlank()) throw rejected(404,"VERIFIER_DISABLED");
        var v=read(body,Verification.class);
        if (!SCHEMA.equals(v.schemaVersion()) || !environment.equals(v.environment()) || v.receiptId()==null
                || v.reportId()==null || v.contentRevision()<1 || v.expiresAt()==null
                || !Instant.now().isBefore(v.expiresAt()) || v.expiresAt().isAfter(Instant.now().plusSeconds(300)))
            throw rejected(403,"INVALID_VERIFICATION_RECEIPT");
        choice(v.result(),"PASSED","FAILED","EXISTS");
        identifier(v.evidenceId());
        text(v.evidenceReference(),200);
        String hash=digest(body);
        byte[] signatureMessage=String.join("\n",SCHEMA,"POST",AttentionContentController.verifyPath(itemId),
                environment,v.receiptId().toString(),hash).getBytes(StandardCharsets.US_ASCII);
        if (!validSignature(key(verifierKey),signatureMessage,signature)) throw rejected(403,"INVALID_VERIFIER_SIGNATURE");
        var target=target(itemId);
        if (key(verifierKey).equals(key(target.key()))) throw rejected(403,"VERIFIER_MUST_BE_INDEPENDENT");
        queue.lockExisting(target.owner());
        var item=queue.itemForOwner(target.owner(),itemId);
        if ("DISMISSED".equals(item.status())) throw rejected(409,"TARGET_HIDDEN");
        if (!target.grant().sourceKey().equals(v.sourceKey()) || !item.sourceKey().equals(v.sourceKey()))
            throw rejected(409,"VERIFICATION_UNBOUND");
        var prior=db.queryForList("""
                select body_hash,verified_at from attention_content_verifications where receipt_id=? and item_id=?
                """,v.receiptId(),itemId);
        if (!prior.isEmpty()) {
            var p=prior.getFirst();
            if (!hash.equals(p.get("body_hash"))) throw rejected(409,"IDEMPOTENCY_MISMATCH");
            return new VerificationReceipt(v.receiptId(),itemId,v.contentRevision(),v.evidenceId(),v.result(),
                    ((Timestamp)p.get("verified_at")).toInstant());
        }
        var evidence=db.queryForList("""
                select e->>'kind' as kind, r.content::text as content from attention_content_heads h
                join attention_content_reports r using(item_id,content_revision)
                cross join lateral jsonb_array_elements(r.content->'evidence') e
                where h.item_id=? and h.content_revision=? and r.report_id=? and r.body_hash=?
                  and e->>'id'=? and e->>'reference'=?
                """,itemId,v.contentRevision(),v.reportId(),v.reportBodyHash(),v.evidenceId(),v.evidenceReference());
        if (evidence.size()!=1) throw rejected(409,"VERIFICATION_UNBOUND");
        if (!"TEST".equals(evidence.getFirst().get("kind")))throw rejected(400,"UNSUPPORTED_VERIFICATION_SOURCE");
        validateTestAttestation(v,(String)evidence.getFirst().get("content"));
        var now=Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        int count=db.update("""
                insert into attention_content_verifications
                    (receipt_id,item_id,content_revision,evidence_id,result,body_hash,verified_at,source_attestation)
                values (?,?,?,?,?,?,?,cast(? as jsonb)) on conflict do nothing
                """,v.receiptId(),itemId,v.contentRevision(),v.evidenceId(),v.result(),hash,Timestamp.from(now),json.writeValueAsString(v.attestation()));
        if (count==0) throw rejected(409,"VERIFICATION_ALREADY_BOUND");
        queue.bumpForOwner(target.owner());
        return new VerificationReceipt(v.receiptId(),itemId,v.contentRevision(),v.evidenceId(),v.result(),now);
    }

    private void validateTestAttestation(Verification verification,String storedContent) {
        var proof=verification.attestation();
        if(proof==null || !"git-checked-test".equals(proof.sourceOrigin())
                || proof.sourceSha()==null || !proof.sourceSha().matches("[a-f0-9]{40}")
                || proof.suiteSha256()==null || !proof.suiteSha256().matches("[a-f0-9]{64}")
                || proof.script()==null || !proof.script().matches("tools/[a-z0-9-]{1,80}\\.mjs")
                || proof.arguments()==null || proof.arguments().size()>4
                || proof.arguments().stream().anyMatch(arg->arg==null || !arg.matches("[a-zA-Z0-9_-]{1,48}"))
                || proof.startedAt()==null || proof.finishedAt()==null || proof.finishedAt().isBefore(proof.startedAt())
                || proof.finishedAt().isAfter(Instant.now().plusSeconds(30)) || proof.startedAt().isBefore(Instant.now().minusSeconds(600))
                || proof.total()==null || proof.total()<1 || proof.failed()==null || proof.failed()<0 || proof.failed()>Math.min(proof.total(),8)
                || proof.exitCode()==null || proof.exitCode()!=(proof.failed()==0?0:1)
                || proof.failures()==null || proof.failures().size()!=proof.failed()
                || !verification.result().equals(proof.failed()==0?"PASSED":"FAILED"))
            throw rejected(400,"INVALID_TEST_ATTESTATION");

        var content=json.readTree(storedContent);
        var outcome=content.path("outcome");
        var remaining=content.path("remaining");
        if(!outcome.path("state").asText().equals(proof.failed()==0?"SUCCEEDED":"FAILED")
                || !outcome.path("fact").path("text").asText().equals(proof.total()+"건 실행, "+proof.failed()+"건 실패")
                || !remaining.isArray() || remaining.size()!=proof.failed())
            throw rejected(409,"ATTESTATION_RESULT_MISMATCH");
        for(int i=0;i<proof.failed();i++){
            var failure=proof.failures().get(i);
            if(failure==null)throw rejected(400,"INVALID_TEST_ATTESTATION");
            text(failure.input(),96);
            text(failure.reason(),160);
            if(failure.input().matches("(?s).*[\\r\\n\\t].*") || failure.reason().matches("(?s).*[\\r\\n\\t].*"))
                throw rejected(400,"INVALID_TEST_ATTESTATION");
            var actual="실패 입력 "+json.writeValueAsString(failure.input())+" · "+failure.reason();
            if(!actual.equals(remaining.get(i).path("fact").path("text").asText()))
                throw rejected(409,"ATTESTATION_RESULT_MISMATCH");
        }
    }

    private Target target(UUID id) {
        var rows = db.query("select * from attention_content_targets where item_id=? and public_key is not null", (r,n) ->
                new Target(r.getObject("user_id",UUID.class),
                        new Grant(id,r.getObject("logical_task_id",UUID.class),r.getObject("run_id",UUID.class),
                                r.getString("environment"),r.getString("source_key"),r.getObject("generation",UUID.class),
                                r.getObject("create_receipt",UUID.class),r.getTimestamp("expires_at").toInstant(),r.getString("reserve_hash")),
                        r.getString("approved_title"),r.getString("approved_request"),r.getString("public_key"),
                        r.getString("reserve_hash"),r.getTimestamp("created_at").toInstant(),
                        r.getTimestamp("revoked_at") != null), id);
        if (rows.isEmpty()) throw rejected(409, "REPORT_UNBOUND");
        return rows.getFirst();
    }

    private static void validateIdentity(Target t, Submission in) {
        boolean ended = "turn.completed".equals(in.eventId());
        if (!("exec:" + t.grant().runId() + ":1").equals(in.turnId())
                || in.eventId() == null
                || !Set.of("turn.completed","runner.failed","runner.timeout","runner.interrupted","runner.no_report",
                        "runner.cancelled_prestart").contains(in.eventId())
                || ended && in.sessionId() == null || in.producedAt() == null
                || in.upstreamTurnId()!=null
                || in.producedAt().isAfter(Instant.now().plusSeconds(300))
                || in.producedAt().isBefore(t.createdAt().minusSeconds(300)))
            throw rejected(409, "REPORT_UNBOUND");
        var outcome=in.report()==null || in.report().outcome()==null ? null : in.report().outcome().state();
        if ("runner.cancelled_prestart".equals(in.eventId()) && in.sessionId()!=null)
            throw rejected(409,"LIFECYCLE_UNBOUND");
        var required=switch(in.eventId()){
            case "runner.cancelled_prestart" -> "CANCELLED";
            case "runner.timeout","runner.interrupted","runner.no_report" -> "UNKNOWN";
            default -> null;
        };
        if(required!=null && !required.equals(outcome))throw rejected(400,"INVALID_LIFECYCLE_OUTCOME");
        if(ended && "CANCELLED".equals(outcome))throw rejected(400,"CANCELLATION_NOT_OBSERVED");
        if (!ended && in.report() != null && in.report().outcome() != null
                && "SUCCEEDED".equals(in.report().outcome().state()))
            throw rejected(400, "NO_COMPLETION_OBSERVED");
    }

    private static void validateReport(Report report) {
        if (report == null || report.outcome() == null) throw rejected(400, "INVALID_REPORT");
        text(report.sourceTitle(),100);
        text(report.request(),1200);
        for (var line : bounded(report.performed(),6)) text(line,600);
        choice(report.outcome().state(),"SUCCEEDED","PARTIAL","FAILED","CANCELLED","BLOCKED","UNKNOWN");
        text(report.outcome().fact(),1000);
        var ids = new HashSet<String>();
        for (var e : bounded(report.evidence(),8)) {
            if (!ids.add(identifier(e.id()))) throw rejected(400,"DUPLICATE_EVIDENCE");
            choice(e.kind(),"TEST","BUILD","COMMIT","DEPLOY","ARTIFACT","OTHER");
            text(e.label(),400);
            if (e.reference() != null) text(e.reference(),200);
        }
        ids.clear();
        for (var r : bounded(report.remaining(),8)) {
            if (!ids.add(identifier(r.id()))) throw rejected(400,"DUPLICATE_REMAINING");
            choice(r.kind(),"QUESTION","APPROVAL","BLOCKER","NEXT_ACTION","MISSING_VALIDATION");
            choice(r.state(),"OPEN","RESOLVED");
            text(r.fact(),400);
        }
        if ("BLOCKED".equals(report.outcome().state()) && report.remaining().stream().noneMatch(r ->
                "OPEN".equals(r.state()) && Set.of("QUESTION","APPROVAL","BLOCKER").contains(r.kind())))
            throw rejected(400,"BLOCKED_WITHOUT_OPEN_ITEM");
        for (var line : bounded(report.limitations(),6)) text(line,400);
    }

    private Map<String,Object> projection(Target t, Submission in, int revision, Instant received, boolean preview, DesktopSubmission desktop) {
        var r = in.report();
        var data = new LinkedHashMap<String,Object>();
        data.put("schemaVersion", SCHEMA);
        data.put("contentRevision", revision);
        boolean reported = desktop==null ? "turn.completed".equals(in.eventId()) : desktop.answerCaptured();
        data.put("producer",desktop==null?PRODUCER:"CODEX_DESKTOP");
        data.put("quality",reported?"REPORTED":"LIMITED");
        String requestOrigin = desktop==null?"USER_EDITED":desktop.requestCaptured()?"EVENT_METADATA":"UNKNOWN";
        data.put("sourceTitle", fact(t.title(),requestOrigin,100));
        data.put("request",fact(t.request(),requestOrigin,preview?100:1200));
        if (desktop!=null) {
            data.put("requestCaptured",desktop.requestCaptured());
            data.put("answerCaptured",desktop.answerCaptured());
            data.put("requestProvenance",desktop.requestCaptured()?"LOCAL_EXTRACTIVE":"DETAIL_NOT_CAPTURED");
        }
        String origin = reported?"AGENT_REPORTED":"EVENT_METADATA";
        data.put("outcome",Map.of("state",r.outcome().state(),"fact",fact(r.outcome().fact(),origin,preview?90:1000)));
        data.put("performed",r.performed().stream().limit(preview?1:6)
                .map(s->fact(s,origin,preview?70:600)).toList());
        data.put("evidence",r.evidence().stream().limit(preview?1:8).map(e->{
            var value = new LinkedHashMap<String,Object>();
            value.put("id",e.id());
            value.put("kind",e.kind());
            value.put("label",clip(e.label(),preview?55:400));
            value.put("verification","AGENT_REPORTED");
            if (!preview) value.put("reference", e.reference());
            return value;
        }).toList());
        data.put("remaining",r.remaining().stream().sorted(Comparator.comparing(x->!x.state().equals("OPEN")))
                .limit(preview?1:8).map(x->Map.of("id",x.id(),"kind",x.kind(),"state",x.state(),
                        "fact",fact(x.fact(),origin,preview?55:400))).toList());
        data.put("eventId", in.eventId());
        if(in.upstreamTurnId()!=null)data.put("upstreamTurnId",in.upstreamTurnId());
        if (!preview) {
            data.put("agentTitle",fact(r.sourceTitle(),origin,100));
            data.put("agentRequest",fact(r.request(),origin,1200));
            data.put("limitations",r.limitations().stream().map(x->fact(x,origin,400)).toList());
            data.put("logicalTaskId",t.grant().logicalTaskId());
            data.put("runId",in.runId());
            data.put("sessionId",in.sessionId());
            data.put("turnId",in.turnId());
            data.put("reportId",in.reportId());
            data.put("reportRevision",in.reportRevision());
            data.put("producedAt",in.producedAt());
            data.put("receivedAt",received);
        }
        return data;
    }

    private static Map<String,String> fact(String s, String origin, int limit) {
        return Map.of("text",clip(s,limit),"origin",origin);
    }
    private static String clip(String text, int max) {
        text=text.replace("\r\n","\n").replace('\r','\n').strip();
        if (text.length() <= max) return text;
        int cut = max - 1;
        if (Character.isHighSurrogate(text.charAt(cut-1))) cut--;
        return text.substring(0,cut) + "…";
    }
    private static <T> List<T> bounded(List<T> v,int max) {
        if (v == null || v.size() > max || v.stream().anyMatch(Objects::isNull))
            throw rejected(400,"INVALID_REPORT_ARRAY");
        return v;
    }
    private static String identifier(String s) {
        if (s == null || !s.matches("[a-zA-Z0-9_-]{1,32}")) throw rejected(400,"INVALID_REPORT_ID");
        return s;
    }
    private static void choice(String value,String... choices) {
        if (value == null || !Set.of(choices).contains(value)) throw rejected(400,"INVALID_REPORT_VALUE");
    }
    private static String text(String value,int max) {
        var normalized = AttentionService.multiline(value,max).strip();
        if (normalized.isBlank() || normalized.matches("(?is).*(-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer [A-Za-z0-9_.~-]{16,}|(?:aqp_|aqd_|sk-)[A-Za-z0-9_-]{18,}|[a-z]:[\\\\/]|file://).*"))
            throw rejected(400,"INVALID_REPORT_TEXT");
        return normalized;
    }
    private static <T> T read(byte[] body,Class<T> type) {
        try {
            T value = INPUT.readValue(StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(body)).toString(),type);
            if (value == null) throw rejected(400,"INVALID_REPORT");
            return value;
        } catch (java.io.IOException e) {
            throw rejected(400,"INVALID_REPORT");
        }
    }
    static String digest(byte[] body) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(body)); }
        catch (NoSuchAlgorithmException ex) { throw new IllegalStateException(ex); }
    }
    private static PublicKey key(String value) {
        try {
            if (value == null || value.length() > 100) throw new IllegalArgumentException();
            return KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(Base64.getUrlDecoder().decode(value)));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw rejected(400,"INVALID_REPORT_KEY");
        }
    }
    private static void verify(Target t,String path,UUID nonce,String hash,String signed) {
        var g=t.grant();
        byte[] message=String.join("\n",SCHEMA,"POST",path,g.environment(),g.createReceipt().toString(),
                Long.toString(g.expiresAt().toEpochMilli()),nonce.toString(),hash).getBytes(StandardCharsets.US_ASCII);
        if (!validSignature(key(t.key()),message,signed)) throw rejected(403,"INVALID_REPORT_SIGNATURE");
    }
    private static boolean validSignature(PublicKey key, byte[] message,String signed) {
        try {
            if (signed==null || signed.length()!=86) return false;
            var sig=Signature.getInstance("Ed25519");
            sig.initVerify(key);
            sig.update(message);
            return sig.verify(Base64.getUrlDecoder().decode(signed));
        } catch (GeneralSecurityException | IllegalArgumentException e) {return false;}
    }
    private static AttentionException rejected(int status,String code) { return new AttentionException(status,code); }
}

