package com.kafka.backend.morning;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import java.net.*;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.*;

/** Local HTTP fixture only: never contacts ElevenLabs or consumes credits. */
class ElevenLabsCredentialBrokerTest {
    private HttpServer server;
    private URI endpoint;
    private final Instant now = Instant.parse("2026-10-17T00:00:00Z");
    private final AtomicReference<String> query = new AtomicReference<>();
    private final AtomicReference<String> header = new AtomicReference<>();
    private int status = 200;
    private String response;
    @BeforeEach void start() throws Exception {
        response = "{\"token\":\"" + token(now.plusSeconds(60)) + "\",\"conversation_id\":\"conv_fixture\"}";
        server = HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/token", exchange -> {
            query.set(exchange.getRequestURI().getRawQuery()); header.set(exchange.getRequestHeaders().getFirst("xi-api-key"));
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start(); endpoint = URI.create("http://127.0.0.1:"+server.getAddress().getPort()+"/token");
    }
    @AfterEach void stop() { server.stop(0); }
    private String token(Instant exp) {
        return "header."+Base64.getUrlEncoder().withoutPadding().encodeToString(("{\"exp\":"+exp.getEpochSecond()+"}").getBytes(StandardCharsets.UTF_8))+".signature";
    }
    private MorningVoiceProperties.Release release() { return MorningVoiceServiceTest.configured(UUID.randomUUID()).getReleases().get("approved-test"); }
    private ElevenLabsCredentialBroker broker() { return new ElevenLabsCredentialBroker(HttpClient.newHttpClient(),endpoint,name -> "server-test-only-key"); }
    @Test void requestPinsApprovedVersionAndBranchWithoutReturningPermanentKey() {
        var credential = broker().issue(release(),now);
        assertThat(query.get()).contains("agent_id=agent_test","version_id=version_pinned","branch_id=branch_test","environment=staging","debug_events_request=false");
        assertThat(header.get()).isEqualTo("server-test-only-key");
        var connection = (MorningVoiceContract.ElevenLabsConnection) credential.connection();
        assertThat(connection.conversationToken()).isEqualTo(token(now.plusSeconds(60)));
        assertThat(credential.expiresAt()).isEqualTo(now.plusSeconds(60));
        assertThat(credential.toString()).doesNotContain(connection.conversationToken(),"server-test-only-key");
    }
    @Test void absentSecretDoesNotMakeAnyHttpRequest() {
        var broker = new ElevenLabsCredentialBroker(HttpClient.newHttpClient(),endpoint,name -> null);
        assertThatThrownBy(() -> broker.issue(release(),now)).isInstanceOf(MorningVoiceException.class);
        assertThat(query.get()).isNull();
    }
    @Test void rejectsExpiredOrUnboundedCredential() {
        response = "{\"token\":\""+token(now.minusSeconds(1))+"\",\"conversation_id\":\"conv_fixture\"}";
        assertThatThrownBy(() -> broker().issue(release(),now)).isInstanceOf(MorningVoiceException.class);
        response = "{\"token\":\""+token(now.plusSeconds(7200))+"\",\"conversation_id\":\"conv_fixture\"}";
        assertThatThrownBy(() -> broker().issue(release(),now)).isInstanceOf(MorningVoiceException.class);
    }
    @Test void providerFailuresDoNotLeakResponseBodiesOrSecrets() {
        status = 503; response = "private-upstream-error-and-server-test-only-key";
        assertThatThrownBy(() -> broker().issue(release(),now)).isInstanceOfSatisfying(MorningVoiceException.class,
                e -> assertThat(e.getMessage()).isEqualTo("PROVIDER_UNAVAILABLE"));
        status = 429;
        assertThatThrownBy(() -> broker().issue(release(),now)).isInstanceOfSatisfying(MorningVoiceException.class,
                e -> assertThat(e.code()).isEqualTo("PROVIDER_QUOTA_EXCEEDED"));
    }
}
