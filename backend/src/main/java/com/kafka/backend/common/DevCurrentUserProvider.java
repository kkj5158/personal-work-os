package com.kafka.backend.common;

import org.springframework.beans.factory.annotation.Value;
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
 * Must be replaced by a real Supabase JWT-backed CurrentUserProvider
 * before this application is used by more than the local developer.
 */
@Component
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
