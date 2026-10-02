package com.kafka.backend.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Configuration;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.mock.web.MockServletContext;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class WorkflowDevelopmentSecurityTest {
    static final String TOKEN="tk_wf_dev_synthetic-test-value-only";
    static final UUID OWNER=UUID.randomUUID();
    @Configuration @EnableWebSecurity @EnableWebMvc
    @Import({WorkflowDevelopmentSecurity.class,Endpoints.class})
    static class Config{}
    @RestController
    static class Endpoints{
        @GetMapping("/api/workflow/project-profiles") Object profiles(){return java.util.Map.of("owner",new ProdCurrentUserProvider().getCurrentUserId());}
        @PatchMapping("/api/workflow/projects/{id}") void patch(){}
        @DeleteMapping("/api/workflow/projects/{id}") void deleteProject(){}
        @GetMapping("/api/money") void money(){}
    }
    @Test void devIntegrationCredentialIsOwnerBoundAndRestrictedToProjectOperations()throws Exception{
        try(var context=new AnnotationConfigWebApplicationContext()){
            context.setServletContext(new MockServletContext());
            context.getEnvironment().setActiveProfiles("hosted-dev");
            var properties=new java.util.HashMap<String,Object>();
            properties.put("app.workflow-development.owner-id",OWNER.toString());
            properties.put("app.workflow-development.token-sha256",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(TOKEN.getBytes(StandardCharsets.UTF_8))));
            context.getEnvironment().getPropertySources().addFirst(new org.springframework.core.env.MapPropertySource("test",properties));
            context.register(Config.class);context.refresh();
            MockMvc http=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
            http.perform(get("/api/workflow/project-profiles").header("Authorization","Bearer "+TOKEN)).andExpect(status().isOk()).andExpect(jsonPath("$.owner").value(OWNER.toString()));
            http.perform(get("/api/workflow/project-profiles").header("Authorization","Bearer tk_wf_dev_wrong")).andExpect(status().isUnauthorized());
            http.perform(patch("/api/workflow/projects/"+UUID.randomUUID()).header("Authorization","Bearer "+TOKEN)).andExpect(status().isOk());
            http.perform(delete("/api/workflow/projects/"+UUID.randomUUID()).header("Authorization","Bearer "+TOKEN)).andExpect(status().isForbidden());
            http.perform(get("/api/money").header("Authorization","Bearer "+TOKEN)).andExpect(status().isForbidden());
            assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        }
    }
}
