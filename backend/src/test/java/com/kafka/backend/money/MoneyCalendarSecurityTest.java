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
  for(String path:List.of("/ledger?month=2026-10&kind=INCOME","/templates","/work?month=2026-10","/pay-calendar?month=2026-10","/earnings-calendar?month=2026-10","/earnings-weeks/2026-10-11","/earnings-records/"+UUID.randomUUID(),"/pay-weeks/2026-10-11","/weeks/2026-10-12","/work-records/"+UUID.randomUUID()))mvc.perform(get("/api/money/calendar"+path)).andExpect(status().isUnauthorized());
  for(String path:List.of("/templates/"+UUID.randomUUID(),"/work-records/"+UUID.randomUUID(),"/weeks/2026-10-12","/pay-weeks/2026-10-11"))mvc.perform(put("/api/money/calendar"+path).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());mvc.perform(post("/api/money/calendar/work-records/"+UUID.randomUUID()+"/remove-off").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());verifyNoInteractions(work,ledger);
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
 @Test void newPayRoutesForwardSundayAndWorkEditorOmissionPreservesPaymentIntent()throws Exception{
  var id=UUID.randomUUID();when(work.payCalendar("2026-10")).thenReturn(Map.of("records",List.of()));when(work.saveWork(eq(id),any())).thenReturn(Map.of("id",id));when(work.savePayWeek(any(),any())).thenReturn(Map.of("totalPay",65000));when(work.removeOff(eq(id),any())).thenReturn(Map.of("removed",true));
  mvc.perform(get("/api/money/calendar/pay-calendar?month=2026-10").with(jwt())).andExpect(status().isOk());
  mvc.perform(put("/api/money/calendar/work-records/"+id).with(jwt()).contentType("application/json").content("{\"expectedVersion\":1,\"workDate\":\"2026-10-01\",\"status\":\"OFF\"}")).andExpect(status().isOk());verify(work).saveWork(eq(id),argThat(in->in.payments()==null&&in.status().equals("OFF")));
  mvc.perform(put("/api/money/calendar/pay-weeks/2026-10-11").with(jwt()).contentType("application/json").content("{\"expectedVersion\":0,\"expectedTotalPay\":65000,\"specialWorkAllowance\":0,\"weeklyHolidayAllowance\":0,\"publicHolidayAllowance\":0,\"incentive\":0}")).andExpect(status().isOk());verify(work).savePayWeek(eq(java.time.LocalDate.of(2026,10,11)),argThat(in->in.expectedTotalPay()==65000&&in.incentive()==0));
  mvc.perform(put("/api/money/calendar/pay-weeks/2026-10-11").with(jwt()).contentType("application/json").content("{\"expectedTotalPay\":65000.5}")).andExpect(status().isBadRequest());
  mvc.perform(post("/api/money/calendar/work-records/"+id+"/remove-off").with(jwt()).contentType("application/json").content("{\"expectedVersion\":2}")).andExpect(status().isOk());verify(work).removeOff(eq(id),argThat(in->in.expectedVersion()==2));
 }
 @Test void confirmedEarningsHttpParserRejectsDecimalsAndSupportsDirectAndV2Amounts()throws Exception{
  var id=UUID.randomUUID();when(work.saveEarnings(eq(id),any())).thenReturn(Map.of("confirmedDailyPay",64000));when(work.earningsCalendar("2026-10")).thenReturn(Map.of("records",List.of()));when(work.saveEarningsWeek(any(),any())).thenReturn(Map.of("finalPay",64070));
  mvc.perform(get("/api/money/calendar/earnings-calendar?month=2026-10").with(jwt())).andExpect(status().isOk());mvc.perform(put("/api/money/calendar/earnings-records/"+id).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());mvc.perform(put("/api/money/calendar/earnings-weeks/2026-10-11").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
  for(String field:List.of("basePay","dailyIncentive","totalDeduction","confirmedDailyPay"))mvc.perform(put("/api/money/calendar/earnings-records/"+id).with(jwt()).contentType("application/json").content("{\""+field+"\":1.5}")).andExpect(status().isBadRequest());
  mvc.perform(put("/api/money/calendar/earnings-records/"+id).with(jwt()).contentType("application/json").content("{\"expectedVersion\":1,\"workDate\":\"2026-10-01\",\"status\":\"SCHEDULED\",\"basePay\":60000,\"dailyIncentive\":5000,\"totalDeduction\":1000,\"confirmedDailyPay\":999999,\"payments\":[],\"legacyWageSnapshot\":{}}")).andExpect(status().isOk());verify(work).saveEarnings(eq(id),argThat(in->in.basePay()==60000&&in.dailyIncentive()==5000&&in.totalDeduction()==1000&&in.confirmedDailyPay()==999999&&in.status().equals("SCHEDULED")));
  mvc.perform(put("/api/money/calendar/earnings-records/"+id).with(jwt()).contentType("application/json").content("{\"expectedVersion\":1,\"workDate\":\"2026-10-01\",\"status\":\"COMPLETED\",\"confirmedDailyPay\":38410,\"dailyIncentive\":2000,\"legacyWageSnapshot\":{}}" )).andExpect(status().isOk());verify(work).saveEarnings(eq(id),argThat(in->in.confirmedDailyPay()==38410&&in.dailyIncentive()==2000&&in.basePay()==null&&in.totalDeduction()==null));
  mvc.perform(put("/api/money/calendar/earnings-weeks/2026-10-11").with(jwt()).contentType("application/json").content("{\"expectedVersion\":0,\"expectedDailyFingerprint\":\"snapshot\",\"specialWorkAllowance\":30,\"weeklyHolidayAllowance\":40,\"publicHolidayAllowance\":999999,\"incentive\":999999}")).andExpect(status().isOk());verify(work).saveEarningsWeek(eq(java.time.LocalDate.of(2026,10,11)),argThat(in->in.specialWorkAllowance()==30&&in.weeklyHolidayAllowance()==40&&in.expectedDailyFingerprint().equals("snapshot")));
 }
 @Test void scheduleReceiptContractParsesExplicitNullFalseAndVersionWithoutOwnerOverride()throws Exception{
  var id=UUID.randomUUID();when(work.saveEarnings(eq(id),any())).thenReturn(Map.of("id",id,"receiptConfirmed",false));
  String body="{\"expectedVersion\":0,\"contractVersion\":4,\"selectedTemplateVersion\":1,\"reselectPreset\":true,\"workDate\":\"2026-10-01\",\"status\":\"SCHEDULED\",\"confirmedDailyPay\":null,\"dailyIncentive\":0,\"receiptConfirmed\":false,\"userId\":\"untrusted\",\"receiptConfirmation\":{\"confirmed\":true,\"amount\":999999}}";
  mvc.perform(put("/api/money/calendar/earnings-records/"+id).with(jwt()).contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.receiptConfirmed").value(false));
  verify(work).saveEarnings(eq(id),argThat(in->in.contractVersion()==4&&in.selectedTemplateVersion()==1&&Boolean.TRUE.equals(in.reselectPreset())&&in.confirmedDailyPay()==null&&in.dailyIncentive()==0&&Boolean.FALSE.equals(in.receiptConfirmed())));
  mvc.perform(put("/api/money/calendar/earnings-records/"+id).with(jwt()).contentType("application/json").content("{\"contractVersion\":4,\"receiptConfirmed\":null}")).andExpect(status().isOk());verify(work).saveEarnings(eq(id),argThat(in->in.receiptConfirmed()==null&&in.selectedTemplateVersion()==null));
  for(String field:List.of("contractVersion","selectedTemplateVersion"))mvc.perform(put("/api/money/calendar/earnings-records/"+id).with(jwt()).contentType("application/json").content("{\""+field+"\":1.5}")).andExpect(status().isBadRequest());
 }
}
