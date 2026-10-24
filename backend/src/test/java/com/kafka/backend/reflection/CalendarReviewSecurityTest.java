package com.kafka.backend.reflection;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@WebMvcTest(value=CalendarReviewController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class}) @ActiveProfiles("prod")
class CalendarReviewSecurityTest {
 @Autowired MockMvc mvc;@MockitoBean CalendarReviewService service;@MockitoBean JwtDecoder decoder;
 @Test void anonymousCannotReadOrWriteAnyReview() throws Exception{for(String path:new String[]{"?from=2026-10-01&to=2026-10-31","/days/2026-10-24","/weeks/2026-10-19"})mvc.perform(get("/api/calendar/reviews"+path)).andExpect(status().isUnauthorized());mvc.perform(put("/api/calendar/reviews/weeks/2026-10-19").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());verifyNoInteractions(service);}
 @Test void missingWeekUsesNoContentWithoutCreatingARecord() throws Exception{mvc.perform(get("/api/calendar/reviews/weeks/2026-10-19").with(jwt())).andExpect(status().isNoContent());verify(service).weekly(java.time.LocalDate.of(2026,10,19));verifyNoMoreInteractions(service);}
 @Test void fractionalScoresAndVersionsAreRejected() throws Exception{for(String body:new String[]{"{\"score\":0.2,\"expectedVersion\":-1}","{\"mood\":1.5,\"expectedVersion\":-1}","{\"score\":0,\"expectedVersion\":0.1}"})mvc.perform(put("/api/calendar/reviews/days/2026-10-24").with(jwt()).contentType("application/json").content(body)).andExpect(status().isBadRequest());verifyNoInteractions(service);}
 @Test void authenticatedZeroReachesDomainAndConflictIs409() throws Exception{when(service.saveDaily(any(),any())).thenThrow(new OptimisticLockConflictException("변경됨"));mvc.perform(put("/api/calendar/reviews/days/2026-10-24").with(jwt()).contentType("application/json").content("{\"title\":\"제목\",\"memo\":\"메모\",\"score\":0,\"mood\":null,\"expectedVersion\":0}")).andExpect(status().isConflict()).andExpect(jsonPath("$.message").value("변경됨"));}
}
