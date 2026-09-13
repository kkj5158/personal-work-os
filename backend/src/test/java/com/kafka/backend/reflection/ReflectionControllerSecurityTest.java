package com.kafka.backend.reflection;

import com.kafka.backend.common.*;
import com.kafka.backend.notesystem.integration.ReflectionProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Use the actual PROD filter chain: an absent reflection must not trigger login or /error dispatch. */
@WebMvcTest(value = ReflectionController.class, properties = {
        "app.supabase.jwks-uri=https://example.invalid/jwks", "app.supabase.issuer=https://example.invalid",
        "app.cors.allowed-origins=http://localhost:3000" })
@Import({ProdSecurityConfig.class, ProdCurrentUserProvider.class, ApiExceptionHandler.class})
@ActiveProfiles("prod")
class ReflectionControllerSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean ReflectionProvider provider;
    @MockitoBean ReflectionEntryRepository repository;
    @MockitoBean JwtDecoder jwtDecoder;
    final UUID user = UUID.randomUUID();
    final LocalDate day = LocalDate.of(2026, 9, 11);

    @Test void missingReflectionReturnsPlain404WithoutRedirectOrSendError() throws Exception {
        when(provider.findMain(user, day)).thenReturn(Optional.empty());
        var result = mvc.perform(get("/api/reflections/" + day).with(jwt().jwt(j -> j.subject(user.toString()))))
                .andExpect(status().isNotFound()).andExpect(header().doesNotExist("Location")).andReturn();
        assertThat(result.getResponse().getErrorMessage()).isNull();
        assertThat(result.getResponse().getForwardedUrl()).isNull();
        assertThat(result.getResolvedException()).isNull();
    }
    @Test void domainNotFoundIsHandledWithoutErrorDispatcher() throws Exception {
        when(provider.findMain(user, day)).thenThrow(new ResourceNotFoundException("not found"));
        var result = mvc.perform(get("/api/reflections/" + day).with(jwt().jwt(j -> j.subject(user.toString()))))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.message").value("not found")).andReturn();
        assertThat(result.getResponse().getErrorMessage()).isNull();
        assertThat(result.getResponse().getForwardedUrl()).isNull();
    }
    @Test void actualAuthenticationFailureStillReturns401() throws Exception {
        mvc.perform(get("/api/reflections/" + day)).andExpect(status().isUnauthorized());
        verifyNoInteractions(provider);
    }
}
