package com.kafka.backend.morning;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import static com.kafka.backend.morning.MorningVoiceContract.*;

@Service
public class MorningVoiceService {
    private final MorningVoiceProperties properties;
    private final MorningSessionStore sessions;
    private final Map<String, MorningCredentialBroker> providers;
    private final Clock clock;
    @Autowired
    public MorningVoiceService(MorningVoiceProperties properties, MorningSessionStore sessions,
                               List<MorningCredentialBroker> brokers) {
        this(properties, sessions, brokers, Clock.systemUTC());
    }
    MorningVoiceService(MorningVoiceProperties properties, MorningSessionStore sessions,
                        List<MorningCredentialBroker> brokers, Clock clock) {
        this.properties = properties; this.sessions = sessions; this.clock = clock;
        this.providers = brokers.stream().collect(Collectors.toUnmodifiableMap(MorningCredentialBroker::provider, Function.identity()));
    }
    public Readiness readiness() {
        UUID owner = owner();
        try {
            var release = approved(owner);
            return new Readiness(true, release.provider(), properties.getActiveRelease(), "AVAILABLE", release.capabilities());
        } catch (MorningVoiceException e) {
            return new Readiness(false, null, null, e.code(), null);
        }
    }
    public Authorization authorize(AuthorizeRequest request) {
        UUID owner = owner();
        if (!request.accepted() || request.occurrenceId() == null || request.attemptId() == null)
            throw new MorningVoiceException(400, "EXPLICIT_ACCEPTANCE_REQUIRED");
        var release = approved(owner);
        String releaseName = properties.getActiveRelease();
        Instant now = clock.instant();
        // Commit reservation before external credential issuance. Never retry an ambiguous issuance.
        UUID id = sessions.reserve(owner, request, releaseName, release, properties.getBudget(), now);
        try {
            var credential = providers.get(release.provider()).issue(release, now);
            sessions.issued(owner, id, credential, clock.instant());
            Session session = sessions.find(owner, id, clock.instant());
            return new Authorization(id, request.attemptId(), release.provider(), releaseName,
                    providers.get(release.provider()).transport(), credential.expiresAt(), session.sessionDeadline(), release.maxDurationSeconds(),
                    release.capabilities(), credential.connection(), "UNRECONCILED");
        } catch (RuntimeException e) {
            sessions.failed(owner, id);
            if (e instanceof MorningVoiceException safe) throw safe;
            throw new MorningVoiceException(503, "PROVIDER_UNAVAILABLE");
        }
    }
    public Session find(UUID id) { return sessions.find(owner(), id, clock.instant()); }
    public Session event(UUID id, EventRequest request) {
        return sessions.event(owner(), id, request.eventId(), request.event().name(), clock.instant());
    }
    public Session end(UUID id, EndRequest request) {
        return sessions.event(owner(), id, request.eventId(), request.reason().name(), clock.instant());
    }
    private MorningVoiceProperties.Release approved(UUID owner) {
        if (!properties.isEnabled()) throw new MorningVoiceException(503, "PROVIDER_DISABLED");
        if (!properties.getAllowedOwners().contains(owner)) throw new MorningVoiceException(403, "VOICE_ACCESS_DENIED");
        var release = properties.getReleases().get(properties.getActiveRelease());
        if (release == null || release.provider() == null || !providers.containsKey(release.provider()))
            throw new MorningVoiceException(503, "PROVIDER_UNAVAILABLE");
        if (!valid(release.agentId(), 160) || !valid(release.versionId(),160) ||
                !valid(properties.getActiveRelease(),120) || !valid(release.pricingVersion(),120) ||
                release.environment() == null || !release.environment().matches("[A-Za-z0-9_-]{1,64}") ||
                release.credentialEnvironmentVariable() == null || !release.credentialEnvironmentVariable().matches("[A-Z][A-Z0-9_]{2,100}") ||
                release.maxDurationSeconds() < 10 || release.maxDurationSeconds() > 3600 ||
                release.credentialMaxAgeSeconds() < 10 || release.credentialMaxAgeSeconds() > 3600 ||
                !release.providerHardLimitVerified() || release.capabilities() == null ||
                (release.branchId() != null && !release.branchId().isEmpty() && !valid(release.branchId(),160)))
            throw new MorningVoiceException(503, "PROVIDER_CONFIGURATION_PENDING");
        if (!providers.get(release.provider()).configured(release))
            throw new MorningVoiceException(503, "PROVIDER_CONFIGURATION_PENDING");
        var budget = properties.getBudget();
        if (budget == null || !budget.isConfigured() || budget.getDailySessionLimit() < 1 ||
                budget.getConcurrentSessionLimit() < 1 || budget.getMaximumSessionCost() == null ||
                !validMoney(budget.getMaximumSessionCost()) || budget.getDailyCostLimit() == null ||
                !validMoney(budget.getDailyCostLimit()) ||
                budget.getDailyCostLimit().compareTo(budget.getMaximumSessionCost()) < 0 ||
                budget.getCurrency() == null || !budget.getCurrency().matches("[A-Z]{3}"))
            throw new MorningVoiceException(503, "BUDGET_POLICY_REQUIRED");
        return release;
    }
    private boolean valid(String text, int max) { return text != null && text.matches("[A-Za-z0-9_.-]{1," + max + "}"); }
    private boolean validMoney(java.math.BigDecimal value) {
        return value.signum() > 0 && value.scale() <= 8 && value.precision() - value.scale() <= 16;
    }
    /** Deliberately does not use fixed dev owner or unrelated service-token principals. */
    private UUID owner() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken jwt) || !jwt.isAuthenticated())
            throw new MorningVoiceException(401, "AUTHENTICATION_REQUIRED");
        try { return UUID.fromString(jwt.getToken().getSubject()); }
        catch (RuntimeException e) { throw new MorningVoiceException(401, "AUTHENTICATION_REQUIRED"); }
    }
}
