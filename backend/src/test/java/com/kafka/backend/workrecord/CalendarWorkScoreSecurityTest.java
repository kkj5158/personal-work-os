package com.kafka.backend.workrecord;
import com.kafka.backend.common.*;
import com.kafka.backend.worktimeentry.WorkTimeEntryService;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@WebMvcTest(value=WorkRecordController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class}) @ActiveProfiles("prod")
class CalendarWorkScoreSecurityTest {
 @Autowired MockMvc mvc;@MockitoBean WorkRecordService service;@MockitoBean WorkTimeEntryService time;@MockitoBean SupplementalWorkEntryService supplemental;@MockitoBean JwtDecoder decoder;
 @Test void anonymousScoreWriteIsUnauthorized() throws Exception{mvc.perform(put("/api/work-records/2026-10-24/score").contentType("application/json").content("{\"score\":0,\"expectedVersion\":0}")).andExpect(status().isUnauthorized());verifyNoInteractions(service);}
 @Test void fractionsMissingScoreAndOutOfRangeIntegerCannotClearOrRoundScore() throws Exception{for(String body:new String[]{"{\"score\":0.5,\"expectedVersion\":0}","{\"expectedVersion\":0}","{\"score\":null,\"expectedVersion\":1.5}","{\"score\":4294967296,\"expectedVersion\":0}"})mvc.perform(put("/api/work-records/2026-10-24/score").with(jwt()).contentType("application/json").content(body)).andExpect(status().isBadRequest());verifyNoInteractions(service);}
}
