package com.kafka.backend.common;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SupabaseAuthUserMirrorTest {
    private static Jwt jwt(UUID id) {
        return Jwt.withTokenValue("verified-test-token").header("alg", "ES256")
                .subject(id.toString()).claim("email", "fixture@example.invalid")
                .claim("app_metadata", Map.of("provider", "email"))
                .claim("user_metadata", Map.of("display_name", "migration fixture"))
                .claim("is_anonymous", false).build();
    }

    @Test void existingImportedIdentityIsNeverChanged() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID id = UUID.randomUUID();
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(id))).thenReturn(true);
        SupabaseAuthUserMirror mirror = new SupabaseAuthUserMirror(jdbc);
        mirror.ensureIdentity(jwt(id)); mirror.ensureIdentity(jwt(id));
        assertTrue(mirror.isKnown(id));
        verify(jdbc, times(1)).queryForObject(anyString(), eq(Boolean.class), eq(id));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test void newVerifiedIdentityGetsTheSameUuidAndConflictSafeAnchor() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID id = UUID.randomUUID();
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(id))).thenReturn(false);
        new SupabaseAuthUserMirror(jdbc).ensureIdentity(jwt(id));
        verify(jdbc).update(contains("ON CONFLICT (id) DO NOTHING"), eq(id),
                eq("fixture@example.invalid"), eq("{\"provider\":\"email\"}"),
                eq("{\"display_name\":\"migration fixture\"}"), eq(false));
    }

    @Test void aFailedDatabaseWriteIsRetriedInsteadOfBeingCached() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID id = UUID.randomUUID();
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(id))).thenReturn(false);
        when(jdbc.update(anyString(), any(Object[].class))).thenThrow(new IllegalStateException("fixture failure"));
        SupabaseAuthUserMirror mirror = new SupabaseAuthUserMirror(jdbc);
        assertThrows(IllegalStateException.class, () -> mirror.ensureIdentity(jwt(id)));
        assertFalse(mirror.isKnown(id));
        assertThrows(IllegalStateException.class, () -> mirror.ensureIdentity(jwt(id)));
        verify(jdbc, times(2)).queryForObject(anyString(), eq(Boolean.class), eq(id));
    }

    @Test void aRolledBackTransactionDoesNotCacheAnUncommittedIdentity() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        UUID id = UUID.randomUUID();
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(id))).thenReturn(false);
        SupabaseAuthUserMirror mirror = new SupabaseAuthUserMirror(jdbc);
        TransactionSynchronizationManager.initSynchronization();
        try {
            mirror.ensureIdentity(jwt(id));
            assertFalse(mirror.isKnown(id));
            assertEquals(1, TransactionSynchronizationManager.getSynchronizations().size());
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
        mirror.ensureIdentity(jwt(id));
        verify(jdbc, times(2)).queryForObject(anyString(), eq(Boolean.class), eq(id));
    }

    @Test void itIsEnabledOnlyExplicitlyInAuthenticatedHostedProfiles() {
        for (String profile : new String[]{"prod", "hosted-dev"}) {
            new ApplicationContextRunner()
                    .withInitializer(context -> context.getEnvironment().setActiveProfiles(profile))
                    .withUserConfiguration(SupabaseAuthUserMirror.class)
                    .withBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class))
                    .withPropertyValues("app.auth.mirror.enabled=true")
                    .run(context -> assertNotNull(context.getBean(SupabaseAuthUserMirror.class)));
        }
        new ApplicationContextRunner()
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
                .withUserConfiguration(SupabaseAuthUserMirror.class)
                .run(context -> assertFalse(context.containsBean("supabaseAuthUserMirror")));
        new ApplicationContextRunner()
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("dev"))
                .withUserConfiguration(SupabaseAuthUserMirror.class)
                .withPropertyValues("app.auth.mirror.enabled=true")
                .run(context -> assertFalse(context.containsBean("supabaseAuthUserMirror")));
    }
}
