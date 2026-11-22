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
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

@WebMvcTest(value=MoneyAccountLedgerController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class MoneyAccountLedgerSecurityTest {
 @Autowired MockMvc mvc;@Autowired CurrentUserProvider users;
 @MockitoBean MoneyAccountLedgerService service;@MockitoBean JwtDecoder decoder;
 @Test void anonymousReadsAndAllWritesRequireAuthentication()throws Exception{
  String row="/api/money/account-ledger/rows/"+UUID.randomUUID();
  mvc.perform(get("/api/money/account-ledger?from=2026-09-01&to=2026-09-30")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/money/account-ledger/pending?from=2026-09-01&to=2026-09-30")).andExpect(status().isUnauthorized());
  mvc.perform(get(row)).andExpect(status().isUnauthorized());
  mvc.perform(patch(row+"/financial-type").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
  for(String action:List.of("preview","execute","metadata","category"))mvc.perform(post(row+"/"+action).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());verifyNoInteractions(service);
 }
 @Test void identityComesFromJwtAndForeignRowRemainsIndistinguishableFromMissing()throws Exception{
  UUID owner=UUID.randomUUID(),foreign=UUID.randomUUID();
  when(service.read(anyString(),anyString(),isNull(),isNull(),eq("ALL"),isNull(),eq(50),eq(0))).thenAnswer(call->{assertThat(users.getCurrentUserId()).isEqualTo(owner);return Map.of("items",List.of(),"total",0);});
  mvc.perform(get("/api/money/account-ledger?from=2026-09-01&to=2026-09-30&userId="+foreign).with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
  when(service.row(foreign)).thenThrow(new ResourceNotFoundException("소유 거래를 찾을 수 없습니다."));mvc.perform(get("/api/money/account-ledger/rows/"+foreign).with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isNotFound());
 }
 @Test void directTypeRejectsAConcurrentVersionWithConflict()throws Exception{
  UUID id=UUID.randomUUID();
  when(service.financialType(eq(id),any())).thenThrow(new OptimisticLockConflictException("거래 버전 충돌"));
  mvc.perform(patch("/api/money/account-ledger/rows/"+id+"/financial-type").with(jwt())
      .contentType("application/json").content("{\"requestId\":\""+UUID.randomUUID()+"\",\"expectedVersion\":0,\"financialType\":\"EXPENSE\"}"))
      .andExpect(status().isConflict());
 }
 @Test void malformedAndCombinedAccountIdentifiersReturn400()throws Exception{
  UUID owner=UUID.randomUUID();
  mvc.perform(get("/api/money/account-ledger?from=2026-09-01&to=2026-09-30&accountId="+UUID.randomUUID()+","+UUID.randomUUID()).with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isBadRequest());
  mvc.perform(get("/api/money/account-ledger?from=2026-09-01&to=2026-09-30").param("accountId",UUID.randomUUID().toString(),UUID.randomUUID().toString()).with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isBadRequest());
  mvc.perform(get("/api/money/account-ledger/pending?from=2026-09-01&to=2026-09-30&accountIds="+UUID.randomUUID()).with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isBadRequest());
  mvc.perform(post("/api/money/account-ledger/rows/"+UUID.randomUUID()+"/execute").with(jwt().jwt(j->j.subject(owner.toString()))).contentType("application/json").content("{\"edit\":{\"requestId\":\"invalid\"}}")).andExpect(status().isBadRequest());verifyNoInteractions(service);
 }
}
