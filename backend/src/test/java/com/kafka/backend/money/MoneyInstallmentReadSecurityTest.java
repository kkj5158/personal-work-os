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
import java.math.BigDecimal;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

@WebMvcTest(value=MoneyInstallmentReadController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class MoneyInstallmentReadSecurityTest {
 @Autowired MockMvc mvc; @Autowired CurrentUserProvider users;
 @MockitoBean MoneyInstallmentReadService service; @MockitoBean JwtDecoder decoder;
 static final String PATH="/api/money/bookkeeping/installment-contributions?from=2026-11-01&to=2026-11-30";
 @Test void anonymousCannotReadFinancialContributions()throws Exception {
  mvc.perform(get(PATH)).andExpect(status().isUnauthorized());verifyNoInteractions(service);
 }
 @Test void suppliedOwnerCannotOverrideAuthenticatedOwner()throws Exception {
  UUID owner=UUID.randomUUID();
  when(service.read(anyString(),anyString(),isNull(),isNull(),eq(50),eq(0),isNull())).thenAnswer(call->{
   assertThat(users.getCurrentUserId()).isEqualTo(owner);
   return new MoneyInstallmentReadService.Page("2026-11-01","2026-11-30","Asia/Seoul","KRW","OCCURRENCE_HISTORY_WITH_AUDITED_CORRECTIONS",new MoneyInstallmentReadService.Totals(BigDecimal.ZERO,0,false,0,List.of(),List.of()),List.of(),0,BigDecimal.ZERO);
  });
  mvc.perform(get(PATH+"&userId="+UUID.randomUUID()).with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isOk()).andExpect(jsonPath("$.totals.amount").value(0));
 }
}
