package com.kafka.backend.workflow;

import com.kafka.backend.common.DevSecurityConfig;
import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.List;
import java.util.UUID;
import static com.kafka.backend.workflow.WorklogNotesService.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(WorklogNotesController.class) @Import(DevSecurityConfig.class) @ActiveProfiles("dev")
class WorklogNotesControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean WorklogNotesService service;

    @Test void resolveAcceptsTheBrowsersTitleOnlyPayloadWithoutContentOrVersion() throws Exception {
        UUID id=UUID.randomUUID();
        when(service.resolve("Outlier")).thenReturn(List.of(new Topic(id,null,"WORK FLOW","Outlier","",0)));
        // Resolve is not a note write. Requiring TopicInput.version here caused
        // Jackson to reject the real browser request before reaching the service.
        mvc.perform(post("/api/workflow/notes/resolve")
            .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Outlier\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].id").value(id.toString()))
            .andExpect(jsonPath("$[0].title").value("Outlier"))
            .andExpect(jsonPath("$[0].workspaceId").doesNotExist());
        verify(service).resolve("Outlier");
        verifyNoMoreInteractions(service);
    }

    @Test void resolveReturnsAllCanonicalChoicesAndPreservesValidationErrors() throws Exception {
        UUID first=UUID.randomUUID(),second=UUID.randomUUID(),workspace=UUID.randomUUID();
        when(service.resolve("Planning")).thenReturn(List.of(
            new Topic(first,null,"WORK FLOW","Planning","",0),
            new Topic(second,workspace,"Existing workspace","Planning","",2)));
        mvc.perform(post("/api/workflow/notes/resolve")
            .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Planning\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].id").value(first.toString()))
            .andExpect(jsonPath("$[1].workspaceId").value(workspace.toString()));
        when(service.resolve("")).thenThrow(new InvalidRequestException("Invalid note title"));
        mvc.perform(post("/api/workflow/notes/resolve")
            .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"\"}"))
            .andExpect(status().isBadRequest());
        verify(service).resolve("Planning");verify(service).resolve("");
    }
}
