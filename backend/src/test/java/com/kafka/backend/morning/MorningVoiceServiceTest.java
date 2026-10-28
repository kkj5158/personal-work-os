package com.kafka.backend.morning;

import org.junit.jupiter.api.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.nio.charset.StandardCharsets;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.morning.MorningVoiceContract.*;

class MorningVoiceServiceTest {
    private final UUID owner = UUID.randomUUID();
    private final Instant now = Instant.parse("2026-10-17T00:00:00Z");
    private MorningVoiceProperties properties;
    private MorningSessionStore store;
    private MorningVoiceService service;
    private AtomicInteger issued;
    private DriverManagerDataSource dataSource;
    private JdbcTemplate jdbc;
    private MorningCredentialBroker broker;
    private boolean failBroker;

    @BeforeEach void setup() throws Exception {
        dataSource = new DriverManagerDataSource("jdbc:h2:mem:morning_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        // H2 executes the authored table schema; PostgreSQL-only RLS/grant clauses need live PG audit later.
        String schema = new ClassPathResource("db/migration/V89__morning_voice_gateway.sql").getContentAsString(StandardCharsets.UTF_8)
                .replaceAll("(?m)^ALTER TABLE morning_voice_.* ENABLE ROW LEVEL SECURITY;\\R?", "")
                .replaceAll("(?m)^REVOKE ALL ON morning_voice_.*;\\R?", "");
        new ResourceDatabasePopulator(new ByteArrayResource(schema.getBytes(StandardCharsets.UTF_8))).execute(dataSource);
        jdbc = new JdbcTemplate(dataSource);
        store = new MorningSessionStore(jdbc, new DataSourceTransactionManager(dataSource));
        properties = configured(owner);
        issued = new AtomicInteger();
        broker = new MorningCredentialBroker() {
            public String provider() { return "elevenlabs"; }
            public String transport() { return "provider_sdk"; }
            public Credential issue(MorningVoiceProperties.Release release, Instant time) {
                issued.incrementAndGet();
                if (failBroker) throw new MorningVoiceException(503,"PROVIDER_UNAVAILABLE");
                return new Credential(new ElevenLabsConnection("elevenlabs_webrtc_token","temporary-test-only"), "conv_test", time.plusSeconds(60));
            }
        };
        service = new MorningVoiceService(properties,store,List.of(broker),Clock.fixed(now,ZoneOffset.UTC));
        login(owner);
    }
    @AfterEach void clean() { SecurityContextHolder.clearContext(); }
    static MorningVoiceProperties configured(UUID owner) {
        var props = new MorningVoiceProperties();
        props.setEnabled(true); props.setActiveRelease("approved-test"); props.setAllowedOwners(Set.of(owner));
        props.setReleases(Map.of("approved-test", new MorningVoiceProperties.Release("elevenlabs","agent_test","version_pinned","branch_test",
                "MORNING_TEST_API_KEY","staging",120,120,true,"test-pricing-v1",
                new Capabilities(true,true,false,true,false,false,false,true))));
        var budget = props.getBudget();
        budget.setConfigured(true); budget.setDailySessionLimit(2); budget.setConcurrentSessionLimit(1);
        budget.setMaximumSessionCost(new BigDecimal("2")); budget.setDailyCostLimit(new BigDecimal("4")); budget.setCurrency("USD");
        return props;
    }
    private void login(UUID id) {
        var jwt = Jwt.withTokenValue("not-a-real-token").header("alg","ES256").subject(id.toString()).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt,List.of()));
    }
    private AuthorizeRequest request() { return new AuthorizeRequest(UUID.randomUUID(),UUID.randomUUID(),true); }
    private void denied(String code, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(MorningVoiceException.class,e -> assertThat(e.code()).isEqualTo(code));
    }
    @Test void noAuthenticationOrAcceptanceMeansNoCredential() {
        denied("EXPLICIT_ACCEPTANCE_REQUIRED", () -> service.authorize(new AuthorizeRequest(UUID.randomUUID(),UUID.randomUUID(),false)));
        SecurityContextHolder.clearContext();
        denied("AUTHENTICATION_REQUIRED", () -> service.authorize(request()));
        assertThat(issued.get()).isZero();
    }
    @Test void providerDefaultsDisabledAndRequiresBudget() {
        properties.setEnabled(false);
        denied("PROVIDER_DISABLED", () -> service.authorize(request()));
        properties.setEnabled(true); properties.getBudget().setConfigured(false);
        denied("BUDGET_POLICY_REQUIRED", () -> service.authorize(request()));
        assertThat(issued.get()).isZero();
    }
    @Test void unapprovedOwnerAndUnpinnedReleaseNeverIssue() {
        login(UUID.randomUUID()); denied("VOICE_ACCESS_DENIED", () -> service.authorize(request()));
        login(owner);
        var release = properties.getReleases().get("approved-test");
        properties.setReleases(Map.of("approved-test",new MorningVoiceProperties.Release(release.provider(),release.agentId(),null,null,
                release.credentialEnvironmentVariable(),"staging",120,120,true,"test",release.capabilities())));
        denied("PROVIDER_CONFIGURATION_PENDING", () -> service.authorize(request()));
        assertThat(issued.get()).isZero();
    }
    @Test void duplicateOccurrenceAndAttemptSurviveNewServiceAndStore() {
        var request = request();
        var authorization = service.authorize(request);
        var restarted = new MorningVoiceService(properties,new MorningSessionStore(jdbc,new DataSourceTransactionManager(dataSource)),List.of(broker),Clock.fixed(now,ZoneOffset.UTC));
        denied("DUPLICATE_ATTEMPT", () -> restarted.authorize(request));
        denied("DUPLICATE_ATTEMPT", () -> restarted.authorize(new AuthorizeRequest(request.occurrenceId(),UUID.randomUUID(),true)));
        denied("DUPLICATE_ATTEMPT", () -> restarted.authorize(new AuthorizeRequest(UUID.randomUUID(),request.attemptId(),true)));
        assertThat(issued.get()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM morning_voice_sessions",Integer.class)).isEqualTo(1);
        assertThat(service.find(authorization.sessionId()).usage().finalReportedCost()).isNull();
        assertThat(authorization.toString()).doesNotContain("temporary-test-only");
    }
    @Test void ownerIsolationForGetAndEvents() {
        var authorization = service.authorize(request());
        login(UUID.randomUUID());
        denied("SESSION_NOT_FOUND", () -> service.find(authorization.sessionId()));
        denied("SESSION_NOT_FOUND", () -> service.end(authorization.sessionId(),new EndRequest(UUID.randomUUID(),EndReason.ENDED)));
    }
    @Test void clientEventsAreIdempotentButDoNotClaimBillingOrReleaseReservations() {
        var authorization = service.authorize(request());
        UUID event = UUID.randomUUID();
        service.event(authorization.sessionId(),new EventRequest(event,ClientEvent.CONNECTED));
        service.event(authorization.sessionId(),new EventRequest(event,ClientEvent.CONNECTED));
        UUID endEvent = UUID.randomUUID();
        var ended = service.end(authorization.sessionId(),new EndRequest(endEvent,EndReason.ENDED));
        assertThat(service.end(authorization.sessionId(),new EndRequest(endEvent,EndReason.ENDED))).isEqualTo(ended);
        assertThat(ended.usage().providerStatus()).isEqualTo("UNVERIFIED");
        assertThat(ended.usage().usageStatus()).isEqualTo("UNRECONCILED");
        assertThat(ended.usage().durationSeconds()).isNull();
        denied("EVENT_CONFLICT", () -> service.end(authorization.sessionId(),new EndRequest(event,EndReason.ENDED)));
        denied("INVALID_SESSION_TRANSITION", () -> service.event(authorization.sessionId(),new EventRequest(UUID.randomUUID(),ClientEvent.CONNECTED)));
        denied("PROVIDER_QUOTA_EXCEEDED", () -> service.authorize(request()));
        assertThat(issued.get()).isEqualTo(1);
    }
    @Test void failedOrAmbiguousIssuanceRemainsReservedWithoutAutomaticRetry() {
        var request = request(); failBroker = true;
        denied("PROVIDER_UNAVAILABLE", () -> service.authorize(request));
        failBroker = false;
        denied("DUPLICATE_ATTEMPT", () -> service.authorize(request));
        assertThat(issued.get()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM morning_voice_sessions",String.class)).isEqualTo("FAILED");
    }
    @Test void expiredConcurrencyReservationStillCountsTowardsDailyMaximumCost() {
        service.authorize(request());
        var later = new MorningVoiceService(properties,store,List.of(broker),Clock.fixed(now.plusSeconds(241),ZoneOffset.UTC));
        later.authorize(request());
        var after = new MorningVoiceService(properties,store,List.of(broker),Clock.fixed(now.plusSeconds(482),ZoneOffset.UTC));
        denied("PROVIDER_QUOTA_EXCEEDED", () -> after.authorize(request()));
        assertThat(issued.get()).isEqualTo(2);
    }
    @Test void independentTransactionsCannotExceedConcurrentLimit() throws Exception {
        var release = properties.getReleases().get("approved-test");
        try (var workers = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            Callable<String> reserve = () -> {
                start.await();
                try {
                    new MorningSessionStore(jdbc,new DataSourceTransactionManager(dataSource)).reserve(owner,request(),"approved-test",release,properties.getBudget(),now);
                    return "RESERVED";
                } catch (MorningVoiceException e) { return e.code(); }
            };
            Future<String> first = workers.submit(reserve), second = workers.submit(reserve); start.countDown();
            assertThat(List.of(first.get(10,TimeUnit.SECONDS),second.get(10,TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("RESERVED","PROVIDER_QUOTA_EXCEEDED");
        }
    }
    @Test void changingReleaseDoesNotChangeExistingSessionAndMissingAdapterFailsClearly() {
        var authorization = service.authorize(request());
        properties.setActiveRelease("future-unimplemented");
        denied("PROVIDER_UNAVAILABLE", () -> service.authorize(request()));
        assertThat(service.find(authorization.sessionId()).release()).isEqualTo("approved-test");
        assertThat(issued.get()).isEqualTo(1);
    }
    @Test void subPrecisionCostCannotRoundReservationDownAndBudgetCurrencyCannotBeMixed() {
        properties.getBudget().setMaximumSessionCost(new BigDecimal("0.000000001"));
        denied("BUDGET_POLICY_REQUIRED", () -> service.authorize(request()));
        properties.getBudget().setMaximumSessionCost(new BigDecimal("2"));
        service.authorize(request());
        properties.getBudget().setCurrency("KRW");
        var later = new MorningVoiceService(properties,store,List.of(broker),Clock.fixed(now.plusSeconds(241),ZoneOffset.UTC));
        denied("PROVIDER_QUOTA_EXCEEDED", () -> later.authorize(request()));
        assertThat(issued.get()).isEqualTo(1);
    }
}
