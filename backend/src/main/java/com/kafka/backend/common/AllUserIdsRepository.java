package com.kafka.backend.common;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Read-only enumeration of every user id in Supabase's {@code auth.users}
 * table. Only for background jobs (e.g. the absence backfill scheduler)
 * that run outside any HTTP request and therefore have no
 * {@link CurrentUserProvider} context — request-scoped code must keep
 * using {@link CurrentUserProvider}, never this.
 *
 * Deliberately a plain native query rather than a mapped JPA entity:
 * {@code auth.users} is a Supabase-managed table this application does not
 * own or migrate, so it is read, never modeled as a first-class entity.
 */
@Repository
public class AllUserIdsRepository {

    @PersistenceContext
    private EntityManager entityManager;

    @SuppressWarnings("unchecked")
    public List<UUID> findAllUserIds() {
        return entityManager.createNativeQuery("SELECT id FROM auth.users").getResultList();
    }
}
