package com.kafka.backend.study;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
    value = StudyController.class,
    properties = {
      "app.supabase.jwks-uri=https://example.invalid/jwks",
      "app.supabase.issuer=https://example.invalid",
      "app.cors.allowed-origins=http://localhost:3000"
    })
@Import({ProdSecurityConfig.class, StudyResponseHeaders.class})
@ActiveProfiles("hosted-dev")
class StudySecurityTest {
  @Autowired MockMvc mvc;
  @MockitoBean StudyService service;
  @MockitoBean StudyFiles files;
  @MockitoBean JwtDecoder decoder;

  @Test
  void anonymousCannotAccessAnyStudyFamily() throws Exception {
    for (String route :
        new String[] {
          "/snapshot",
          "/capabilities",
          "/assets",
          "/assets/00000000-0000-4000-8000-000000000001/content"
        }) mvc.perform(get("/api/study" + route)).andExpect(status().isUnauthorized());
    for (String route :
        new String[] {
          "/commands",
          "/assets",
          "/assets/reconcile",
          "/assets/00000000-0000-4000-8000-000000000001/complete",
          "/assets/00000000-0000-4000-8000-000000000001/remove",
          "/workbooks/test/1/review?part=required",
          "/workbooks/test/1/publish"
        })
      mvc.perform(post("/api/study" + route).contentType("application/json").content("{}"))
          .andExpect(status().isUnauthorized());
    verifyNoInteractions(service, files);
  }

  @Test
  void rejectedBearerCannotReadAnswersOrDocuments() throws Exception {
    when(decoder.decode(anyString()))
        .thenThrow(
            new org.springframework.security.oauth2.jwt.BadJwtException("synthetic invalid token"));
    mvc.perform(get("/api/study/snapshot").header("Authorization", "Bearer invalid"))
        .andExpect(status().isUnauthorized());
    verifyNoInteractions(service, files);
  }
}
