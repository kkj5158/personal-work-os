package com.kafka.backend.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * TEMPORARY development-only user context.
 *
 * Returns a single fixed user id for every request, read from
 * configuration (app.dev-user-id / APP_DEV_USER_ID). This id must
 * already exist as a row in Supabase's auth.users table, since
 * every business table has a foreign key to it.
 *
 * {@code @Profile("dev")} restricted: this must never activate under the
 * prod profile, which authenticates via {@link ProdCurrentUserProvider}
 * (real Supabase JWT) instead.
 */
@Component
@Profile("dev")
public class DevCurrentUserProvider implements CurrentUserProvider {

    private final UUID devUserId;

    public DevCurrentUserProvider(@Value("${app.dev-user-id}") String devUserId) {
        this.devUserId = UUID.fromString(devUserId);
    }

    @Override
    public UUID getCurrentUserId() {
        return devUserId;
    }
}
