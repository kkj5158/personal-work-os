package com.kafka.backend.sleep;
import com.kafka.backend.common.*;
import com.kafka.backend.ops.SleepRecoveryAdapter;
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
@WebMvcTest(value=SleepController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({SleepService.class,SleepRecoveryAdapter.class,ProdSecurityConfig.class,ProdCurrentUserProvider.class}) @ActiveProfiles("prod")
class SleepWebSecurityTest {
 @Autowired MockMvc mvc;@MockitoBean JdbcTemplate db;@MockitoBean JwtDecoder jwtDecoder;
 @Test void anonymousSleepAndNapRoutesCannotReadOrWrite() throws Exception {
  for(String route:new String[]{"/today","/sessions","/naps","/naps/summary","/naps/"+UUID.randomUUID(),"/reminder-settings"})mvc.perform(get("/api/sleep/v1"+route)).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/sleep/v1/naps/actions").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());verifyNoInteractions(db);
 }
 @Test void napOwnerIsVerifiedJwtSubjectNeverRequestOwner() throws Exception {
  UUID owner=UUID.randomUUID(),nap=UUID.randomUUID();mvc.perform(get("/api/sleep/v1/naps/"+nap).param("ownerId",UUID.randomUUID().toString()).with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isNotFound());
  verify(db).query(anyString(),any(org.springframework.jdbc.core.RowMapper.class),eq(owner),eq(nap));
 }
 @Test void rejectedBearerCannotReachNapFacts() throws Exception {
  when(jwtDecoder.decode(anyString())).thenThrow(new org.springframework.security.oauth2.jwt.BadJwtException("invalid"));
  mvc.perform(get("/api/sleep/v1/naps").header("Authorization","Bearer invalid-test-token")).andExpect(status().isUnauthorized());verifyNoInteractions(db);
 }
}
