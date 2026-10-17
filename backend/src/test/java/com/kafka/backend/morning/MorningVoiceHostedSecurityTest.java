package com.kafka.backend.morning;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.UUID;
import java.time.Instant;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(MorningVoiceController.class)
@Import(MorningVoiceSecurity.class)
@ActiveProfiles("hosted-dev")
class MorningVoiceHostedSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean MorningVoiceService service;
    @MockitoBean JwtDecoder decoder;
    @Test void absentInvalidAndUnrelatedServiceTokensCannotReachVoiceOperations() throws Exception {
        when(decoder.decode("invalid-token")).thenThrow(new BadJwtException("invalid"));
        mvc.perform(get("/api/orbit/morning/v1/capabilities")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/orbit/morning/v1/capabilities").header("Authorization","Bearer invalid-token"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
        mvc.perform(get("/api/orbit/morning/v1/capabilities").header("Authorization","Workflow unrelated-service-token"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @Test void validBearerGetsNoStoreAndDisabledReadiness() throws Exception {
        when(decoder.decode("valid-token")).thenReturn(Jwt.withTokenValue("valid-token").header("alg","ES256").subject(UUID.randomUUID().toString()).build());
        when(service.readiness()).thenReturn(new MorningVoiceContract.Readiness(false,null,null,"PROVIDER_DISABLED",null));
        mvc.perform(get("/api/orbit/morning/v1/capabilities").header("Authorization","Bearer valid-token"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.status").value("PROVIDER_DISABLED"));
    }
    @Test void requestValidationAndSafeExceptionShape() throws Exception {
        when(decoder.decode("valid-token")).thenReturn(Jwt.withTokenValue("valid-token").header("alg","ES256").subject(UUID.randomUUID().toString()).build());
        mvc.perform(post("/api/orbit/morning/v1/voice-sessions/authorize").header("Authorization","Bearer valid-token")
                .contentType("application/json").content("{\"accepted\":false}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        when(service.authorize(any())).thenThrow(new MorningVoiceException(503,"PROVIDER_DISABLED"));
        mvc.perform(post("/api/orbit/morning/v1/voice-sessions/authorize").header("Authorization","Bearer valid-token")
                .contentType("application/json").content("{\"occurrenceId\":\""+UUID.randomUUID()+"\",\"attemptId\":\""+UUID.randomUUID()+"\",\"accepted\":true}"))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("PROVIDER_DISABLED"));
    }
    @Test void descriptorContractUsesTypedEphemeralTokenAndIsoInstants() throws Exception {
        UUID occurrence = UUID.randomUUID(), attempt = UUID.randomUUID(), session = UUID.randomUUID();
        when(decoder.decode("valid-token")).thenReturn(Jwt.withTokenValue("valid-token").header("alg","ES256").subject(UUID.randomUUID().toString()).build());
        when(service.authorize(any())).thenReturn(new MorningVoiceContract.Authorization(session,attempt,"elevenlabs","approved-test","provider_sdk",
                Instant.parse("2026-10-17T00:01:00Z"),Instant.parse("2026-10-17T00:05:00Z"),120,
                new MorningVoiceContract.Capabilities(true,true,false,true,false,false,false,true),
                new MorningVoiceContract.ElevenLabsConnection("elevenlabs_webrtc_token","test-ephemeral-only"),"UNRECONCILED"));
        mvc.perform(post("/api/orbit/morning/v1/voice-sessions/authorize").header("Authorization","Bearer valid-token")
                .contentType("application/json").content("{\"occurrenceId\":\""+occurrence+"\",\"attemptId\":\""+attempt+"\",\"accepted\":true}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.sessionId").value(session.toString()))
                .andExpect(jsonPath("$.expiresAt").value("2026-10-17T00:01:00Z"))
                .andExpect(jsonPath("$.connection.type").value("elevenlabs_webrtc_token"))
                .andExpect(jsonPath("$.connection.conversationToken").value("test-ephemeral-only"))
                .andExpect(jsonPath("$.capabilities.interruption").value(false))
                .andExpect(jsonPath("$.apiKey").doesNotExist());
    }
}
