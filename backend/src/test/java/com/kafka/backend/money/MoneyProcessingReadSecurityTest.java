package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.*;

@WebMvcTest(value=MoneyProcessingReadController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class MoneyProcessingReadSecurityTest {
 @Autowired MockMvc mvc;@MockitoBean MoneyProcessingReadService read;@MockitoBean JwtDecoder jwtDecoder;
 @Test void anonymousProcessingProjectionCannotReadFinancialObservations()throws Exception{
  mvc.perform(get("/api/money/processing?from=2026-10-14&to=2026-10-14")).andExpect(status().isUnauthorized());verifyNoInteractions(read);
 }
 @Test void authenticatedReadHasNoOwnerOverrideOrWriteRoute()throws Exception{
  when(read.processing("2026-10-14","2026-10-14")).thenReturn(Map.of("items",List.of(),"truncated",false));
  mvc.perform(get("/api/money/processing?from=2026-10-14&to=2026-10-14&userId=untrusted").with(jwt())).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
  verify(read).processing("2026-10-14","2026-10-14");
  mvc.perform(post("/api/money/processing").with(jwt()).contentType("application/json").content("{}")).andExpect(status().isMethodNotAllowed());
 }
 @Test void invalidDatesAreReportedAsValidationErrors()throws Exception{
  when(read.processing("wrong","wrong")).thenThrow(new java.time.DateTimeException("bad"));mvc.perform(get("/api/money/processing?from=wrong&to=wrong").with(jwt())).andExpect(status().isBadRequest());
 }
}
