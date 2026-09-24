package com.kafka.backend.money;

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
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.util.UUID;

@WebMvcTest(value=MoneyController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks",
        "app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({MoneyProductService.class,MoneyService.class,ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class MoneyControllerSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean JdbcTemplate db;
    @MockitoBean JwtDecoder jwtDecoder;
    @Test void anonymousMoneyRoutesAreUnauthorized() throws Exception {
        mvc.perform(get("/api/money/accounts")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/money/notifications").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/money/transactions")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/money/review/confirm").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/money/transactions").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/money/dashboard?month=2026-09")).andExpect(status().isUnauthorized());
        verifyNoInteractions(db);
    }
    @Test void ownerComesFromJwtAndInvalidPayloadReturns400() throws Exception {
        UUID owner=UUID.randomUUID();
        mvc.perform(get("/api/money/accounts").param("userId",UUID.randomUUID().toString()).with(jwt().jwt(j->j.subject(owner.toString()))))
                .andExpect(status().isOk());
        verify(db).query(anyString(),any(org.springframework.jdbc.core.RowMapper.class),eq(owner));
        mvc.perform(post("/api/money/notifications").with(jwt().jwt(j->j.subject(owner.toString())))
                .contentType("application/json").content("{\"postedAt\":\"wrong\",\"text\":\"hello\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("postedAt must be an ISO-8601 instant"));
        mvc.perform(post("/api/money/notifications").with(jwt().jwt(j->j.subject(owner.toString())))
                .contentType("application/json").content("[]")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/money/notifications?state=INVALID").with(jwt().jwt(j->j.subject(owner.toString()))))
                .andExpect(status().isBadRequest());
    }
}
