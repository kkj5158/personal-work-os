package com.kafka.backend.checklistsys;

import com.kafka.backend.common.ProdSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.UUID;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(value=ChecklistSysController.class, properties={"app.supabase.jwks-uri=https://example.invalid/jwks", "app.supabase.issuer=https://example.invalid", "app.cors.allowed-origins=http://localhost:3000"})
@Import(ProdSecurityConfig.class) @ActiveProfiles("prod")
class ChecklistSysDeletionSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean ChecklistSysService service;
    @MockitoBean JwtDecoder decoder;
    @Test void anonymousDeleteIsDeniedBeforeService() throws Exception {
        mvc.perform(delete("/api/checklist-sys/items/"+UUID.randomUUID())).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
}
