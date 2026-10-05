package com.kafka.backend.workflow.attention;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

@WebMvcTest(value=AttentionCredentialController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({AttentionSecurity.class,ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class AttentionSecurityTest {
    @Autowired MockMvc mvc;@MockitoBean AttentionCredentials credentials;@MockitoBean JwtDecoder decoder;
    private final String token="aqd_"+"a".repeat(43);
    @Test void deviceCannotUseWorkTasksMoneyOrManageCredentials()throws Exception{
        when(credentials.authenticate(token)).thenReturn(new AttentionAuthentication(UUID.randomUUID(),UUID.randomUUID(),"human","DEVICE"));
        for(String path:new String[]{"/api/workflow/tasks","/api/money/accounts","/api/workflow/attention/devices","/api/workflow/attention/device-authorizations","/api/workflow/attention/producer-credentials"}){
            mvc.perform(get(path).header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
            mvc.perform(post(path).header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
        }
        verify(credentials,never()).authorize(any());verify(credentials,never()).producer(any());
    }
    @Test void producerHasOnlyCreateAndSourceResolutionScope()throws Exception{
        var producer=new AttentionAuthentication(UUID.randomUUID(),UUID.randomUUID(),"codex-local","PRODUCER");
        String p="aqp_"+"a".repeat(43);when(credentials.authenticate(p)).thenReturn(producer);
        for(String path:new String[]{"/api/workflow/attention/snapshot","/api/workflow/attention/items","/api/workflow/attention/devices"})mvc.perform(get(path).header("Authorization","Bearer "+p)).andExpect(status().isForbidden());
        mvc.perform(post("/api/workflow/attention/items/"+UUID.randomUUID()+"/complete").header("Authorization","Bearer "+p)).andExpect(status().isForbidden());
    }
    @Test void authorizingDeviceRequiresExistingOwnerBrowserIdentity()throws Exception{
        mvc.perform(post("/api/workflow/attention/device-authorizations").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/workflow/attention/device-authorizations").with(jwt().jwt(j->j.subject(UUID.randomUUID().toString()))).contentType("application/json").content("{}")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        verify(credentials).authorize(any());
    }
    @Test void exchangeAloneIsAnonymousPostAndRevokedDevicesRejected()throws Exception{
        mvc.perform(post("/api/workflow/attention/device-exchange").contentType("application/json").content("{}")).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"));
        mvc.perform(get("/api/workflow/attention/device-exchange")).andExpect(status().isUnauthorized());
        when(credentials.authenticate(token)).thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        mvc.perform(get("/api/workflow/attention/snapshot").header("Authorization","Bearer "+token)).andExpect(status().isUnauthorized());
    }
}
