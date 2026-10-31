package com.kafka.backend.morning;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.function.Function;

/** Official WebRTC token endpoint; version_id pins the approved release (no Main fallback).
 * https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token
 */
@Component
public class ElevenLabsCredentialBroker implements MorningCredentialBroker {
    private final HttpClient client;
    private final URI endpoint;
    private final Function<String, String> secrets;
    private final ObjectMapper mapper = new ObjectMapper();

    public ElevenLabsCredentialBroker() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build(),
                URI.create("https://api.elevenlabs.io/v1/convai/conversation/token"), System::getenv);
    }
    // Package-scoped for a local fake HTTP server in tests only; production endpoint is fixed.
    ElevenLabsCredentialBroker(HttpClient client, URI endpoint, Function<String, String> secrets) {
        this.client = client; this.endpoint = endpoint; this.secrets = secrets;
    }
    @Override public String provider() { return "elevenlabs"; }
    @Override public String transport() { return "provider_sdk"; }
    @Override public boolean configured(MorningVoiceProperties.Release release) {
        String value = secrets.apply(release.credentialEnvironmentVariable());
        return value != null && !value.isBlank();
    }
    @Override public Credential issue(MorningVoiceProperties.Release release, Instant now) {
        String key = secrets.apply(release.credentialEnvironmentVariable());
        if (key == null || key.isBlank()) throw new MorningVoiceException(503, "PROVIDER_CONFIGURATION_PENDING");
        String query = "?agent_id=" + encode(release.agentId()) + "&version_id=" + encode(release.versionId())
                + "&environment=" + encode(release.environment()) + "&debug_events_request=false";
        if (release.branchId() != null && !release.branchId().isBlank()) query += "&branch_id=" + encode(release.branchId());
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint + query))
                    .timeout(Duration.ofSeconds(10)).header("xi-api-key", key)
                    .header("Accept", "application/json").GET().build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 429) throw new MorningVoiceException(429, "PROVIDER_QUOTA_EXCEEDED");
            if (response.statusCode() != 200 || response.body().length() > 65536)
                throw new MorningVoiceException(503, "PROVIDER_UNAVAILABLE");
            JsonNode body = mapper.readTree(response.body());
            String token = body.path("token").asText("");
            String conversationId = body.path("conversation_id").asText("");
            if (token.length() > 32000 || conversationId.isBlank() || conversationId.length() > 200)
                throw new MorningVoiceException(503, "PROVIDER_UNAVAILABLE");
            // exp is used only as an upper-bound reservation, never for user authentication.
            // Reject opaque/no-exp tokens rather than guessing their provider validity window.
            String[] parts = token.split("\\.");
            if (parts.length != 3) throw new MorningVoiceException(503, "PROVIDER_UNAVAILABLE");
            JsonNode claims = mapper.readTree(Base64.getUrlDecoder().decode(parts[1]));
            Instant expiry = Instant.ofEpochSecond(claims.path("exp").asLong(0));
            if (!expiry.isAfter(now.plusSeconds(5)) || expiry.isAfter(now.plusSeconds(release.credentialMaxAgeSeconds())))
                throw new MorningVoiceException(503, "CREDENTIAL_EXPIRED");
            return new Credential(new MorningVoiceContract.ElevenLabsConnection("elevenlabs_webrtc_token",token), conversationId, expiry);
        } catch (MorningVoiceException e) { throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new MorningVoiceException(503, "PROVIDER_UNAVAILABLE");
        } catch (Exception e) {
            // Do not retain/log upstream errors, URLs, response bodies or HTTP headers.
            throw new MorningVoiceException(503, "PROVIDER_UNAVAILABLE");
        }
    }
    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
}
