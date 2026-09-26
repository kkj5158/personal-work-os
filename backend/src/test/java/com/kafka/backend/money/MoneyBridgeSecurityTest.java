package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

@WebMvcTest(value={MoneyController.class,MoneyBridgeController.class},properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({MoneyBridgeSecurity.class,ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class MoneyBridgeSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean MoneyBridgeService bridge;
    @MockitoBean MoneyService money;
    @MockitoBean MoneyProductService product;
    @MockitoBean JwtDecoder jwtDecoder;
    private final String token="mb1_"+"a".repeat(43);
    private BridgeAuthentication accepted(){var a=new BridgeAuthentication(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID());when(bridge.authenticate(token)).thenReturn(a);return a;}
    @Test void deviceCredentialCannotReadOrManageAnyProduct()throws Exception{
        accepted();
        for(String path:new String[]{"/api/money/accounts","/api/money/notifications","/api/money/bridge/devices","/api/checklists"})
            mvc.perform(get(path).header("Authorization","Bearer "+token)).andExpect(status().isForbidden())
                .andExpect(r->org.assertj.core.api.Assertions.assertThat(r.getResponse().getErrorMessage()).isNull());
        mvc.perform(post("/api/money/bridge/enrollments").header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
        verifyNoInteractions(money,product);
    }
    @Test void invalidOrRevokedCredentialNeverReachesIngest()throws Exception{
        when(bridge.authenticate(token)).thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        mvc.perform(post("/api/money/notifications").header("Authorization","Bearer "+token).contentType("application/json").content("{}"))
            .andExpect(status().isUnauthorized());verifyNoInteractions(money);
    }
    @Test void enrollmentRequiresWebIdentityAndAnonymousIngestStillFails()throws Exception{
        mvc.perform(post("/api/money/bridge/enrollments")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/money/notifications").contentType("application/json").content("{}" )).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/money/accounts").with(jwt().jwt(j->j.subject(UUID.randomUUID().toString())))).andExpect(status().isOk());
        mvc.perform(post("/api/money/bridge/enrollments").with(jwt().jwt(j->j.subject(UUID.randomUUID().toString())))).andExpect(status().isOk());
        verify(bridge).enroll();
    }
    @Test void exchangeIsOnlyPublicPostAndDoesNotRequireAWebSession()throws Exception{
        mvc.perform(post("/api/money/bridge/exchange").contentType("application/json").content("{\"code\":\"synthetic\",\"installId\":\""+UUID.randomUUID()+"\"}"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(get("/api/money/bridge/exchange")).andExpect(status().isUnauthorized());
        verify(bridge).exchange(eq("synthetic"),any());
    }
    @Test void expiredEnrollmentReturns401WithoutGenericExceptionLogging()throws Exception{
        when(bridge.exchange(anyString(),any())).thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        mvc.perform(post("/api/money/bridge/exchange").contentType("application/json").content("{\"code\":\"expired\",\"installId\":\""+UUID.randomUUID()+"\"}"))
            .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("Bridge request rejected"));
    }
    @Test void deviceIdentityIsAvailableToCanonicalIngestAndReceiptHasNoBody()throws Exception{
        var a=accepted();
        when(money.ingest(anyMap())).thenAnswer(i->{org.assertj.core.api.Assertions.assertThat(new ProdCurrentUserProvider().getCurrentUserId()).isEqualTo(a.ownerId());return new MoneyTypes.IngestResult(true,null);});
        mvc.perform(post("/api/money/notifications").header("Authorization","Bearer "+token).contentType("application/json").content("{}"))
            .andExpect(status().isCreated());
        verify(bridge).receipt(a,201);
    }
}
