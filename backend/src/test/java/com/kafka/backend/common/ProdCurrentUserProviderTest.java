package com.kafka.backend.common;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * By the time this runs in production, ProdSecurityConfig's OAuth2 resource
 * server filter has already verified the JWT's signature/expiration/issuer
 * and populated the SecurityContext — this only tests the subject
 * extraction itself, not token validation (that's Spring Security's own,
 * already-trusted machinery).
 */
class ProdCurrentUserProviderTest {

    private final ProdCurrentUserProvider provider = new ProdCurrentUserProvider();

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void resolvesTheUserIdFromTheJwtSubjectClaim() {
        UUID userId = UUID.randomUUID();
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "ES256")
                .claim("sub", userId.toString())
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));

        assertThat(provider.getCurrentUserId()).isEqualTo(userId);
    }

    @Test
    void rejectsAJwtSubjectThatIsNotAValidUuid() {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "ES256")
                .claim("sub", "not-a-uuid")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));

        assertThatThrownBy(provider::getCurrentUserId).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsWhenNoJwtAuthenticationIsPresent() {
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("principal", "credentials"));

        assertThatThrownBy(provider::getCurrentUserId).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsWhenNoAuthenticationIsPresentAtAll() {
        SecurityContextHolder.clearContext();

        assertThatThrownBy(provider::getCurrentUserId).isInstanceOf(IllegalStateException.class);
    }
}
