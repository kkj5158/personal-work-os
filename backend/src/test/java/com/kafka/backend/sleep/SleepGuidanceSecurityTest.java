package com.kafka.backend.sleep;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@WebMvcTest(value=SleepGuidanceController.class,properties={"app.sleep.guidance.enabled=true","app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({SleepService.class,SleepGuidanceService.class,ProdSecurityConfig.class,ProdCurrentUserProvider.class}) @ActiveProfiles("prod")
class SleepGuidanceSecurityTest {
 @Autowired MockMvc mvc;@MockitoBean JdbcTemplate db;@MockitoBean JwtDecoder jwtDecoder;
 @Test void anonymousCannotReadOrWriteGoalsOrGuidance()throws Exception{
  mvc.perform(get("/api/sleep/v1/goals")).andExpect(status().isUnauthorized());mvc.perform(get("/api/sleep/v1/guidance")).andExpect(status().isUnauthorized());
  mvc.perform(put("/api/sleep/v1/goals").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());verifyNoInteractions(db);
 }
 @Test void goalOwnerAlwaysComesFromVerifiedSubject()throws Exception{
  var owner=UUID.randomUUID();mvc.perform(get("/api/sleep/v1/goals").param("ownerId",UUID.randomUUID().toString()).with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isOk());
  verify(db).query(anyString(),any(org.springframework.jdbc.core.RowMapper.class),eq(owner));
 }
}
