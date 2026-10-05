package com.kafka.backend.workflow.attention;

import com.kafka.backend.common.*;
import com.kafka.backend.money.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Compose the actual existing MONEY and new Attention chains: neither credential acquires the other's authority. */
@WebMvcTest(value={AttentionCredentialController.class,MoneyBridgeController.class,AttentionBridgeIsolationTest.Receipt.class},properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({AttentionSecurity.class,MoneyBridgeSecurity.class,ProdSecurityConfig.class,ProdCurrentUserProvider.class,AttentionBridgeIsolationTest.Receipt.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class AttentionBridgeIsolationTest {
    @RestController static class Receipt { @PostMapping("/api/money/notifications") public String receive(){return new ProdCurrentUserProvider().getCurrentUserId().toString();} }
    @Autowired MockMvc mvc;@MockitoBean AttentionCredentials attention;@MockitoBean MoneyBridgeService money;@MockitoBean JwtDecoder decoder;
    @Test void existingMoneyBridgeRemainsNarrowAndAttentionDoesNotCaptureItsPrefix()throws Exception{
        UUID owner=UUID.randomUUID();String token="mb1_"+"a".repeat(43);
        when(money.authenticate(token)).thenReturn(new BridgeAuthentication(owner,UUID.randomUUID(),UUID.randomUUID()));
        mvc.perform(post("/api/money/notifications").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(content().string(owner.toString()));
        mvc.perform(get("/api/workflow/attention/snapshot").header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
        mvc.perform(post("/api/workflow/attention/device-authorizations").header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
        verify(attention,never()).authenticate(anyString());verify(attention,never()).authorize(any());
    }
    @Test void attentionDeviceCannotReachMoneyExchangeOrIngest()throws Exception{
        String token="aqd_"+"a".repeat(43);when(attention.authenticate(token)).thenReturn(new AttentionAuthentication(UUID.randomUUID(),UUID.randomUUID(),"human","DEVICE"));
        mvc.perform(post("/api/money/notifications").header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
        // MONEY public exchange must not allow an Attention credential to establish MONEY device authority.
        mvc.perform(post("/api/money/bridge/exchange").header("Authorization","Bearer "+token).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        verify(money,never()).exchange(any(),any());
    }
}
