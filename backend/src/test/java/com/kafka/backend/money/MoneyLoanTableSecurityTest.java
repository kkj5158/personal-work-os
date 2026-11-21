package com.kafka.backend.money;

import com.kafka.backend.common.ApiExceptionHandler;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.ProdCurrentUserProvider;
import com.kafka.backend.common.ProdSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static com.kafka.backend.money.MoneyWebTypes.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(value = {MoneyWebController.class, MoneyFinancialController.class}, properties = {
    "app.supabase.jwks-uri=https://example.invalid/jwks", "app.supabase.issuer=https://example.invalid",
    "app.cors.allowed-origins=http://localhost:3000"
})
@Import({ProdSecurityConfig.class, ProdCurrentUserProvider.class, ApiExceptionHandler.class})
@ActiveProfiles("prod")
class MoneyLoanTableSecurityTest {
    private static final String PATH = "/api/money/loans";
    private static final UUID LOAN = UUID.randomUUID();
    private static final UUID OWNER = UUID.randomUUID();
    @Autowired MockMvc mvc;
    @Autowired CurrentUserProvider users;
    @MockitoBean MoneyWebService web;
    @MockitoBean MoneyFinancialService financial;
    @MockitoBean JwtDecoder decoder;

    @Test void unauthenticatedLoanReadsAndWritesAreRejected() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        mvc.perform(get(PATH + "/" + LOAN + "/repayments")).andExpect(status().isUnauthorized());
        mvc.perform(post(PATH).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(put(PATH + "/" + LOAN + "/status").contentType("application/json").content("{}"))
            .andExpect(status().isUnauthorized());
        mvc.perform(put(PATH + "/" + LOAN + "/interest-rate").contentType("application/json").content("{}"))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(web, financial);
    }

    @Test void nullableRateRequiresExplicitFieldAndUsesAuthenticatedOwner() throws Exception {
        when(web.updateLoanRate(eq(LOAN), any())).thenAnswer(call -> {
            assertThat(users.getCurrentUserId()).isEqualTo(OWNER);
            assertThat(call.getArgument(1, LoanRateInput.class)).isEqualTo(new LoanRateInput(null, 7L));
            return null;
        });
        mvc.perform(put(PATH + "/" + LOAN + "/interest-rate").with(jwt().jwt(j -> j.subject(OWNER.toString())))
            .contentType("application/json").content("{\"expectedVersion\":7}"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(web);
        mvc.perform(put(PATH + "/" + LOAN + "/interest-rate").with(jwt().jwt(j -> j.subject(OWNER.toString())))
            .contentType("application/json").content("{\"interestRate\":null,\"expectedVersion\":7,\"userId\":\"ignored\"}"))
            .andExpect(status().isOk());
        verify(web).updateLoanRate(LOAN, new LoanRateInput(null, 7L));
    }

    @Test void existingCreateAndReadContractsStillUseAuthenticatedOwner() throws Exception {
        when(web.loans()).thenAnswer(call -> {
            assertThat(users.getCurrentUserId()).isEqualTo(OWNER);
            return List.of();
        });
        when(web.saveLoan(isNull(), any())).thenAnswer(call -> {
            assertThat(users.getCurrentUserId()).isEqualTo(OWNER);
            assertThat(call.getArgument(1, LoanInput.class).remainingPrincipal()).isEqualByComparingTo(BigDecimal.ZERO);
            return null;
        });
        mvc.perform(get(PATH).with(jwt().jwt(j -> j.subject(OWNER.toString()))))
            .andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(post(PATH).with(jwt().jwt(j -> j.subject(OWNER.toString())))
            .contentType("application/json")
            .content("{\"name\":\"Test\",\"lender\":\"Fixture\",\"type\":\"PERSONAL\",\"remainingPrincipal\":0,\"status\":\"ACTIVE\"}"))
            .andExpect(status().isCreated());
    }
}
