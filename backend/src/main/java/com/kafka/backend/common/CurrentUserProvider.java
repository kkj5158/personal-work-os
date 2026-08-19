package com.kafka.backend.common;

import java.util.UUID;

/**
 * Resolves the identity of the caller for the current request.
 * Controllers and services must obtain the user id through this
 * abstraction and must never accept a userId from request
 * path/query/body.
 *
 * The development implementation returns a fixed UUID from
 * configuration. A later Supabase JWT implementation can replace
 * it without any change to callers.
 */
public interface CurrentUserProvider {

    UUID getCurrentUserId();
}
