package com.kafka.backend.study;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kafka.backend.common.ProdSecurityConfig;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
    value = {StudyEngineController.class, StudyWorkerController.class},
    properties = {
      "app.supabase.jwks-uri=https://example.invalid/jwks",
      "app.supabase.issuer=https://example.invalid",
      "app.cors.allowed-origins=http://localhost:3000"
    })
@Import({ProdSecurityConfig.class, StudyWorkerSecurity.class, StudyResponseHeaders.class})
@ActiveProfiles("hosted-dev")
class StudyWorkerSecurityTest {
  @Autowired MockMvc mvc;
  @MockitoBean StudyEngine engine;
  @MockitoBean JwtDecoder decoder;

  @Test
  void anonymousCannotInspectPlanSourcesOrIssueWorkerCredentials() throws Exception {
    for (String route :
        new String[] {
          "/api/study/engine",
          "/api/study/engine/sources/source/search",
          "/api/study/engine/excerpts/00000000-0000-4000-8000-000000000001"
        }) mvc.perform(get(route)).andExpect(status().isUnauthorized());
    for (String route :
        new String[] {
          "/api/study/engine/plan",
          "/api/study/engine/goals",
          "/api/study/engine/workers",
          "/api/study-worker/claim"
        })
      mvc.perform(post(route).contentType("application/json").content("{}"))
          .andExpect(status().isUnauthorized());
    verifyNoInteractions(engine);
  }

  @Test
  void scopedTokenCannotEscapeToOwnerOrOtherPosRoutesEvenWithValidToken() throws Exception {
    for (String route :
        new String[] {"/api/study/snapshot", "/api/study/engine/workers", "/api/money/accounts"})
      mvc.perform(post(route).header("Authorization", StudyWorkerSecurity.PREFIX + "x".repeat(43)))
          .andExpect(status().isForbidden());
    verifyNoInteractions(engine);
  }

  @Test
  void regularUserJwtIsNotAWorkerCredential() throws Exception {
    mvc.perform(post("/api/study-worker/claim").header("Authorization", "Bearer user-jwt"))
        .andExpect(status().isUnauthorized());
    verifyNoInteractions(engine, decoder);
  }

  @Test
  void expiredOrRevokedWorkerIsRejectedBeforeClaim() throws Exception {
    when(engine.authenticate(anyString()))
        .thenThrow(new StudyException(401, "WORKER_EXPIRED", "expired"));
    mvc.perform(
            post("/api/study-worker/claim")
                .header("Authorization", StudyWorkerSecurity.PREFIX + "x".repeat(43)))
        .andExpect(status().isUnauthorized());
    verify(engine, never()).claimWorker(any());
  }

  @Test
  void validWorkerCanOnlyPullItsBoundOwnerJob() throws Exception {
    var worker = new StudyEngineWorker();
    UUID target = UUID.fromString("00000000-0000-4000-8000-000000000001");
    when(engine.authenticate(anyString())).thenReturn(worker);
    when(engine.claimWorker(eq(worker), nullable(UUID.class)))
        .thenReturn(StudyValidation.JSON.createObjectNode().put("state", "IDLE"));
    mvc.perform(
            post("/api/study-worker/claim")
                .header("Authorization", StudyWorkerSecurity.PREFIX + "x".repeat(43)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.state").value("IDLE"));
    mvc.perform(post("/api/study-worker/claim").param("jobId", target.toString())
            .header("Authorization", StudyWorkerSecurity.PREFIX + "x".repeat(43)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.state").value("IDLE"));
    verify(engine).claimWorker(worker, null);
    verify(engine).claimWorker(worker, target);
  }
}
