package com.kafka.backend.workflow;
import com.kafka.backend.common.ProdSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(value=WorkflowController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import(ProdSecurityConfig.class) @ActiveProfiles("prod")
class WorkRoutineSecurityTest {
 @Autowired MockMvc mvc;@MockitoBean WorkflowService service;@MockitoBean JwtDecoder decoder;
 @Test void anonymousAndInvalidBearerCannotReadOrReset()throws Exception {
  mvc.perform(get("/api/workflow/routine")).andExpect(status().isUnauthorized());
  mvc.perform(put("/api/workflow/routine").contentType("application/json").content("{\"revision\":0,\"blocks\":[]}")).andExpect(status().isUnauthorized());
  when(decoder.decode(anyString())).thenThrow(new org.springframework.security.oauth2.jwt.BadJwtException("invalid"));
  mvc.perform(get("/api/workflow/routine").header("Authorization","Bearer invalid-test-token")).andExpect(status().isUnauthorized());verifyNoInteractions(service);
 }
 @Test void authenticatedContractUsesExistingVersionedBlocksWithoutCallerOwnerArgument()throws Exception {
  UUID owner=UUID.randomUUID();var document=new WorkflowService.FixedTab(owner,"Work Routine",2,List.of());
  when(service.routine()).thenReturn(document);when(service.saveRoutine(any())).thenReturn(document);
  mvc.perform(get("/api/workflow/routine").with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(2));
  mvc.perform(put("/api/workflow/routine").with(jwt().jwt(j->j.subject(owner.toString()))).contentType("application/json").content("{\"revision\":1,\"blocks\":[]}")).andExpect(status().isOk()).andExpect(jsonPath("$.title").value("Work Routine"));
  verify(service).saveRoutine(argThat(d->d.revision()==1&&d.blocks().isEmpty()));
 }
}
