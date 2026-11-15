package com.kafka.backend.log;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kafka.backend.common.ProdSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
    value = LogController.class,
    properties = {
      "app.supabase.jwks-uri=https://example.invalid/jwks",
      "app.supabase.issuer=https://example.invalid",
      "app.cors.allowed-origins=http://localhost:3000"
    })
@Import({ProdSecurityConfig.class, LogHeaders.class, LogErrors.class})
@ActiveProfiles("hosted-dev")
class LogSecurityTest {
  @Autowired MockMvc mvc;
  @MockitoBean LogService service;
  @MockitoBean JwtDecoder decoder;
  static final String P = "/profiles/00000000-0000-4000-8000-000000000001",
      ID = "/00000000-0000-4000-8000-000000000002";

  @Test
  void anonymousCannotReadPrivateFamilies() throws Exception {
    for (String path :
        new String[] {
          "/state", P + "/posts", P + "/draft", P + "/images" + ID, P + "/posts" + ID + "/replies"
        }) mvc.perform(get("/api/log" + path)).andExpect(status().isUnauthorized());
    verifyNoInteractions(service);
  }

  @Test
  void anonymousCannotMutateAnyFamily() throws Exception {
    for (String path :
        new String[] {
          "/profiles",
          P + "/posts",
          P + "/images",
          P + "/images" + ID + "/complete",
          P + "/posts" + ID + "/delete",
          P + "/delete",
          P + "/posts" + ID + "/replies"
        })
      mvc.perform(post("/api/log" + path).contentType("application/json").content("{}"))
          .andExpect(status().isUnauthorized());
    mvc.perform(put("/api/log" + P + "/draft").contentType("application/json").content("{}"))
        .andExpect(status().isUnauthorized());
    verifyNoInteractions(service);
  }

  @Test
  void invalidBearerIsRejectedBeforeDomainAccess() throws Exception {
    when(decoder.decode(anyString()))
        .thenThrow(new org.springframework.security.oauth2.jwt.BadJwtException("invalid"));
    mvc.perform(get("/api/log/state").header("Authorization", "Bearer invalid"))
        .andExpect(status().isUnauthorized());
    verifyNoInteractions(service);
  }

  @Test
  void missingOwnedRecordHas404InsteadOfGeneric500() throws Exception {
    when(service.getPost(any(), any())).thenThrow(new LogException(404, "기록을 찾을 수 없습니다."));
    mvc.perform(
            get("/api/log" + P + "/posts" + ID)
                .with(
                    org.springframework.security.test.web.servlet.request
                        .SecurityMockMvcRequestPostProcessors.jwt()))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.message").value("기록을 찾을 수 없습니다."));
  }

  @Test
  void staleEditHas409AndInvalidImageHas422() throws Exception {
    when(service.updatePost(any(), any(), any()))
        .thenThrow(new LogException(409, "다른 기기에서 변경되었습니다."));
    mvc.perform(
            put("/api/log" + P + "/posts" + ID)
                .with(
                    org.springframework.security.test.web.servlet.request
                        .SecurityMockMvcRequestPostProcessors.jwt())
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isConflict());
    when(service.complete(any(), any()))
        .thenThrow(
            new com.kafka.backend.shareddesk.storage.StorageFailure(
                com.kafka.backend.shareddesk.storage.StorageFailure.Code.DIGEST_MISMATCH));
    mvc.perform(
            post("/api/log" + P + "/images" + ID + "/complete")
                .with(
                    org.springframework.security.test.web.servlet.request
                        .SecurityMockMvcRequestPostProcessors.jwt()))
        .andExpect(status().isUnprocessableEntity());
  }
}
