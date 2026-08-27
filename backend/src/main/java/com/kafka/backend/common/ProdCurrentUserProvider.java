package com.kafka.backend.common;

import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Production user context: resolves the current user id from the
 * authenticated Supabase JWT's {@code sub} claim (the application user's
 * UUID — Supabase issues one auth.users row per user, and {@code sub} is
 * that row's id). {@code @Profile("prod")} restricted — dev uses
 * {@link DevCurrentUserProvider} (a fixed configured id, no login)
 * instead.
 * <p>
 * By the time this runs, {@link ProdSecurityConfig}'s OAuth2 resource
 * server filter has already verified the token's signature, expiration,
 * and issuer — this class only extracts the already-authenticated
 * subject, never re-validates the token itself.
 */
@Component
@Profile("prod")
public class ProdCurrentUserProvider implements CurrentUserProvider {

    @Override
    public UUID getCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (!(authentication instanceof JwtAuthenticationToken jwtAuthentication)) {
            // Should be unreachable: ProdSecurityConfig requires
            // authentication on every /api/** route before a controller
            // method (and therefore this) can run. Fails loudly rather
            // than silently resolving to no user.
            throw new IllegalStateException("No authenticated Supabase JWT present for this request");
        }

        String subject = jwtAuthentication.getToken().getSubject();
        try {
            return UUID.fromString(subject);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("Authenticated JWT subject is not a valid user id");
        }
    }
}
