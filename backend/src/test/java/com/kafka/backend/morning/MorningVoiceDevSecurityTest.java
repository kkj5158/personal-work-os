package com.kafka.backend.morning;

import com.kafka.backend.common.DevSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(MorningVoiceController.class)
@Import({DevSecurityConfig.class,MorningVoiceSecurity.class})
@ActiveProfiles("dev")
class MorningVoiceDevSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean MorningVoiceService service;
    @Test void insecureDevNeverReachesVoiceServiceEvenWithInjectedJwt() throws Exception {
        mvc.perform(get("/api/orbit/morning/v1/capabilities")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/orbit/morning/v1/capabilities").with(jwt())).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/orbit/morning/v1/voice-sessions/authorize").contentType("application/json")
                .content("{\"accepted\":true}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
        verifyNoInteractions(service);
    }
}
