package com.kafka.backend.common;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Keeps the application's auth.users foreign-key anchor when Auth runs separately.
 * Only called with a JWT already verified by the resource-server security filter.
 * Existing imported account rows and credentials are never rewritten. */
@Service
@Profile({"prod", "hosted-dev"})
@ConditionalOnProperty(name = "app.auth.mirror.enabled", havingValue = "true")
public class SupabaseAuthUserMirror {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();
    private final Set<UUID> known = ConcurrentHashMap.newKeySet();

    public SupabaseAuthUserMirror(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // Check before entering the REQUIRES_NEW proxy: cached owners need no connection.
    public boolean isKnown(UUID id) { return known.contains(id); }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureIdentity(Jwt verifiedJwt) {
        UUID id = UUID.fromString(verifiedJwt.getSubject());
        if (known.contains(id)) return;
        if (!Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = ?)", Boolean.class, id))) {
            jdbc.update("""
                INSERT INTO auth.users
                    (id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                     created_at, updated_at, is_anonymous)
                VALUES (?, 'authenticated', 'authenticated', ?, CAST(? AS jsonb),
                        CAST(? AS jsonb), now(), now(), ?)
                ON CONFLICT (id) DO NOTHING
                """, id, verifiedJwt.getClaimAsString("email"),
                    metadata(verifiedJwt, "app_metadata"), metadata(verifiedJwt, "user_metadata"),
                    Boolean.TRUE.equals(verifiedJwt.getClaimAsBoolean("is_anonymous")));
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { known.add(id); }
            });
        } else {
            known.add(id);
        }
    }

    private String metadata(Jwt jwt, String claim) {
        Object value = jwt.getClaim(claim);
        try {
            return json.writeValueAsString(value instanceof Map<?, ?> ? value : Map.of());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Verified identity metadata could not be mirrored");
        }
    }
}
