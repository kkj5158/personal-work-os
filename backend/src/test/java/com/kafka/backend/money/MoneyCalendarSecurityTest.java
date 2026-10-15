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
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(value=MoneyCalendarController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class MoneyCalendarSecurityTest {
 @Autowired MockMvc mvc;@MockitoBean MoneyCalendarService work;@MockitoBean MoneyWebService ledger;@MockitoBean JwtDecoder jwtDecoder;
 @Test void allCalendarReadsAndWritesRequireAuthentication()throws Exception{
  for(String path:List.of("/ledger?month=2026-10&kind=INCOME","/templates","/work?month=2026-10","/weeks/2026-10-12","/work-records/"+UUID.randomUUID()))mvc.perform(get("/api/money/calendar"+path)).andExpect(status().isUnauthorized());
  for(String path:List.of("/templates/"+UUID.randomUUID(),"/work-records/"+UUID.randomUUID(),"/weeks/2026-10-12"))mvc.perform(put("/api/money/calendar"+path).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());verifyNoInteractions(work,ledger);
 }
 @Test void decimalKrwVersionAndDurationRejectedBeforeService()throws Exception{
  var id=UUID.randomUUID();
  for(String body:List.of("{\"expectedVersion\":0,\"presets\":[{\"id\":\""+id+"\",\"amount\":12.5}]}","{\"expectedVersion\":0,\"breakMinutes\":2.5}","{\"expectedVersion\":0.1}"))mvc.perform(put("/api/money/calendar/templates/"+id).with(jwt()).contentType("application/json").content(body)).andExpect(status().isBadRequest());
  mvc.perform(put("/api/money/calendar/work-records/"+id).with(jwt()).contentType("application/json").content("{\"payments\":[{\"id\":\""+id+"\",\"amount\":12.5}]}")).andExpect(status().isBadRequest());
  mvc.perform(put("/api/money/calendar/weeks/2026-10-12").with(jwt()).contentType("application/json").content("{\"specialWorkAllowance\":12.5}")).andExpect(status().isBadRequest());verifyNoInteractions(work,ledger);
 }
 @Test void authenticatedLedgerPassesCanonicalFiltersAndNeverOwnerOverride()throws Exception{
  when(ledger.calendarLedger("2026-10","EXPENSE","none","uncategorized")).thenReturn(Map.of("items",List.of()));mvc.perform(get("/api/money/calendar/ledger?month=2026-10&kind=EXPENSE&accountIds=none&categoryIds=uncategorized&userId=untrusted").with(jwt())).andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());verify(ledger).calendarLedger("2026-10","EXPENSE","none","uncategorized");
 }
 @Test void frontendDraftWithReadOnlySnapshotFieldsParsesDatesAndIgnoresOwnerOverride()throws Exception{
  var id=UUID.randomUUID();var payment=UUID.randomUUID();when(work.saveWork(eq(id),any())).thenReturn(Map.of("id",id,"version",2));
  String body="{\"id\":\""+id+"\",\"version\":1,\"expectedVersion\":1,\"workDate\":\"2026-10-01\",\"status\":\"COMPLETED\",\"templateName\":\"snapshot\",\"presetName\":\"old\",\"presetAmount\":65000,\"templateSnapshot\":{},\"userId\":\"untrusted\",\"payments\":[{\"id\":\""+payment+"\",\"workRecordId\":\""+id+"\",\"workDate\":\"2026-10-01\",\"depositDate\":\"2026-10-02\",\"amount\":1000}]}";
  mvc.perform(put("/api/money/calendar/work-records/"+id).with(jwt()).contentType("application/json").content(body)).andExpect(status().isOk());
  verify(work).saveWork(eq(id),argThat(in->in.expectedVersion()==1&&in.workDate().equals(java.time.LocalDate.of(2026,10,1))&&in.payments().getFirst().depositDate().equals(java.time.LocalDate.of(2026,10,2))&&in.payments().getFirst().amount()==1000));
 }
}
