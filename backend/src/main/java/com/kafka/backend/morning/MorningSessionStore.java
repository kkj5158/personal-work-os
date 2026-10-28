package com.kafka.backend.morning;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;
import static com.kafka.backend.morning.MorningVoiceContract.*;

/** Durable reservations + per-owner DB row locks work across JVMs and survive restart.
 * Credentials never enter this registry. Client events cannot refund cost or unlock a session.
 */
@Repository
public class MorningSessionStore {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    public MorningSessionStore(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc; this.transaction = new TransactionTemplate(manager);
    }
    public UUID reserve(UUID owner, AuthorizeRequest request, String releaseName,
                        MorningVoiceProperties.Release release, MorningVoiceProperties.Budget budget, Instant now) {
        return transaction.execute(tx -> {
            lock(owner);
            Integer duplicates = jdbc.queryForObject("SELECT COUNT(*) FROM morning_voice_sessions WHERE owner_id=? AND (occurrence_id=? OR attempt_id=?)",
                    Integer.class, owner, request.occurrenceId(), request.attemptId());
            if (duplicates != null && duplicates > 0) throw new MorningVoiceException(409, "DUPLICATE_ATTEMPT");
            Instant dayStart = LocalDate.ofInstant(now, ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC);
            Integer daily = jdbc.queryForObject("SELECT COUNT(*) FROM morning_voice_sessions WHERE owner_id=? AND created_at>=?",
                    Integer.class, owner, Timestamp.from(dayStart));
            Integer active = jdbc.queryForObject("SELECT COUNT(*) FROM morning_voice_sessions WHERE owner_id=? AND session_deadline>?",
                    Integer.class, owner, Timestamp.from(now));
            BigDecimal reserved = jdbc.queryForObject("SELECT COALESCE(SUM(reserved_maximum_cost),0) FROM morning_voice_sessions WHERE owner_id=? AND created_at>=?",
                    BigDecimal.class, owner, Timestamp.from(dayStart));
            Integer differentCurrencies = jdbc.queryForObject("SELECT COUNT(*) FROM morning_voice_sessions WHERE owner_id=? AND created_at>=? AND currency<>?",
                    Integer.class, owner, Timestamp.from(dayStart), budget.getCurrency());
            if (daily >= budget.getDailySessionLimit() || active >= budget.getConcurrentSessionLimit() ||
                    differentCurrencies > 0 ||
                    reserved.add(budget.getMaximumSessionCost()).compareTo(budget.getDailyCostLimit()) > 0)
                throw new MorningVoiceException(429, "PROVIDER_QUOTA_EXCEEDED");
            UUID id = UUID.randomUUID();
            Instant expires = now.plusSeconds(release.credentialMaxAgeSeconds());
            Instant deadline = expires.plusSeconds(release.maxDurationSeconds());
            jdbc.update("""
                INSERT INTO morning_voice_sessions(id,owner_id,occurrence_id,attempt_id,provider,release_name,
                    approved_version,status,created_at,expires_at,session_deadline,reserved_maximum_cost,currency,pricing_version)
                VALUES (?,?,?,?,?,?,?,'AUTHORIZING',?,?,?,?,?,?)
                """, id, owner, request.occurrenceId(), request.attemptId(), release.provider(), releaseName,
                    release.versionId(), Timestamp.from(now), Timestamp.from(expires), Timestamp.from(deadline),
                    budget.getMaximumSessionCost(), budget.getCurrency(), release.pricingVersion());
            return id;
        });
    }
    public void issued(UUID owner, UUID id, MorningCredentialBroker.Credential credential, Instant now) {
        int changed = jdbc.update("""
                UPDATE morning_voice_sessions SET status='AUTHORIZED', credential_issued_at=?, expires_at=?,
                    provider_conversation_id=? WHERE owner_id=? AND id=? AND status='AUTHORIZING'
                """, Timestamp.from(now), Timestamp.from(credential.expiresAt()), credential.providerConversationId(), owner, id);
        if (changed != 1) throw new MorningVoiceException(409, "SESSION_TERMINATED");
    }
    public void failed(UUID owner, UUID id) {
        jdbc.update("UPDATE morning_voice_sessions SET status='FAILED' WHERE owner_id=? AND id=? AND status='AUTHORIZING'", owner, id);
    }
    public Session find(UUID owner, UUID id, Instant now) {
        return jdbc.query("SELECT * FROM morning_voice_sessions WHERE owner_id=? AND id=?", rowMapper(now), owner, id)
                .stream().findFirst().orElseThrow(() -> new MorningVoiceException(404, "SESSION_NOT_FOUND"));
    }
    public Session event(UUID owner, UUID id, UUID eventId, String event, Instant now) {
        return transaction.execute(tx -> {
            lock(owner);
            Session current = find(owner, id, now);
            var previous = jdbc.queryForList("SELECT session_id,event_type FROM morning_voice_client_events WHERE owner_id=? AND event_id=?", owner, eventId);
            if (!previous.isEmpty()) {
                if (!id.equals(previous.getFirst().get("session_id")) || !event.equals(previous.getFirst().get("event_type")))
                    throw new MorningVoiceException(409, "EVENT_CONFLICT");
                return current;
            }
            if (event.equals("CONNECTED") && !current.status().equals("AUTHORIZED") && !current.status().equals("CONNECTED"))
                throw new MorningVoiceException(409, "INVALID_SESSION_TRANSITION");
            jdbc.update("INSERT INTO morning_voice_client_events(owner_id,event_id,session_id,event_type,received_at) VALUES (?,?,?,?,?)",
                    owner, eventId, id, event, Timestamp.from(now));
            if (event.equals("CONNECTED")) {
                jdbc.update("UPDATE morning_voice_sessions SET status='CONNECTED',client_connected_at=COALESCE(client_connected_at,?) WHERE owner_id=? AND id=?",
                        Timestamp.from(now), owner, id);
            } else if (current.usage().clientEndedAt() == null) {
                jdbc.update("UPDATE morning_voice_sessions SET status=?,client_ended_at=? WHERE owner_id=? AND id=?", event, Timestamp.from(now), owner, id);
            }
            return find(owner, id, now);
        });
    }
    private void lock(UUID owner) {
        jdbc.update("INSERT INTO morning_voice_owner_guards(owner_id) VALUES (?) ON CONFLICT DO NOTHING", owner);
        jdbc.queryForObject("SELECT owner_id FROM morning_voice_owner_guards WHERE owner_id=? FOR UPDATE", UUID.class, owner);
    }
    private RowMapper<Session> rowMapper(Instant now) {
        return (rs, n) -> new Session(rs.getObject("id", UUID.class), rs.getObject("occurrence_id", UUID.class),
                rs.getObject("attempt_id", UUID.class), rs.getString("provider"), rs.getString("release_name"),
                now.isAfter(time(rs, "session_deadline")) ? "EXPIRED" : rs.getString("status"),
                time(rs,"created_at"), time(rs,"expires_at"), time(rs,"session_deadline"),
                new Usage("UNVERIFIED", rs.getString("usage_status"), time(rs,"credential_issued_at"),
                        time(rs,"client_connected_at"), time(rs,"client_ended_at"),
                        rs.getObject("duration_seconds", Long.class), rs.getObject("input_tokens", Long.class),
                        rs.getObject("output_tokens", Long.class), rs.getObject("audio_tokens", Long.class),
                        rs.getBigDecimal("provider_credits"), rs.getBigDecimal("reserved_maximum_cost"),
                        rs.getBigDecimal("estimated_cost"), rs.getBigDecimal("final_reported_cost"),
                        rs.getString("currency"), rs.getString("pricing_version")));
    }
    private static Instant time(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column); return value == null ? null : value.toInstant();
    }
}
