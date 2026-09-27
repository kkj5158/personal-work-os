package com.kafka.backend.workflow;

import com.kafka.backend.common.DevSecurityConfig;
import com.kafka.backend.common.OptimisticLockConflictException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({WorkflowController.class, WorkflowPlanningController.class}) @Import(DevSecurityConfig.class) @ActiveProfiles("dev")
class WorkflowV1ControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean WorkflowService service; @MockitoBean WorkflowPlanningService planning;
    @MockitoBean WorkflowProjectionService projections; @MockitoBean WorkflowResourceService resources;

    @Test void patchSendsOnlyChangedFieldsAndConflictIs409() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(patch("/api/workflow/tasks/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":4,\"deadlineDate\":\"2026-10-01\"}")).andExpect(status().isOk());
        verify(service).patchTask(eq(id), argThat(m -> m.size() == 2 && m.get("deadlineDate").equals("2026-10-01") && ((Number) m.get("expectedRevision")).intValue() == 4));
        when(service.patchTask(any(), any())).thenThrow(new OptimisticLockConflictException("Task changed"));
        mvc.perform(patch("/api/workflow/tasks/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"expectedRevision\":3,\"memo\":\"x\"}")).andExpect(status().isConflict());
    }
    @Test void statusArchiveContinueAndTodayRoutes() throws Exception {
        UUID id = UUID.randomUUID(); LocalDate day = LocalDate.of(2026, 9, 30);
        mvc.perform(post("/api/workflow/tasks/" + id + "/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"WAITING\",\"expectedRevision\":2,\"waitingReason\":\"QA\",\"waitingCheckDate\":\"2026-10-02\"}")).andExpect(status().isOk());
        verify(service).changeStatus(eq(id), argThat(s -> s.status().equals("WAITING") && s.expectedRevision() == 2 && s.waitingCheckDate().equals(LocalDate.of(2026, 10, 2))));
        mvc.perform(post("/api/workflow/tasks/" + id + "/archive").contentType(MediaType.APPLICATION_JSON).content("{\"archived\":true,\"expectedRevision\":5}")).andExpect(status().isOk());
        verify(service).archiveTask(eq(id), argThat(a -> a.archived() && a.expectedRevision() == 5));
        when(service.continueTask(id, day)).thenReturn(new TaskReferenceResult(new Day(day, 1, List.of()), UUID.randomUUID(), true, true));
        mvc.perform(post("/api/workflow/tasks/" + id + "/continue").contentType(MediaType.APPLICATION_JSON).content("{\"date\":\"2026-09-30\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.created").value(true)).andExpect(jsonPath("$.day.revision").value(1));
    }
    @Test void planningAndProjectionRoutes() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(put("/api/workflow/tasks/" + id + "/plan-days/2026-09-29")).andExpect(status().isOk());
        verify(planning).addPlanDay(id, LocalDate.of(2026, 9, 29));
        mvc.perform(get("/api/workflow/plan?from=2026-09-30&to=2026-09-30")).andExpect(status().isOk());
        verify(projections).plan(LocalDate.of(2026, 9, 30), LocalDate.of(2026, 9, 30));
        mvc.perform(get("/api/workflow/weeks/2026-09-28")).andExpect(status().isOk());
        mvc.perform(get("/api/workflow/weeks/not-a-date")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/workflow/waiting")).andExpect(status().isOk());
        verify(projections).waiting(null);
        mvc.perform(delete("/api/workflow/resources/" + id)).andExpect(status().isNoContent());
        mvc.perform(put("/api/workflow/order").contentType(MediaType.APPLICATION_JSON).content("{\"scope\":\"projects\",\"ids\":[\"" + id + "\"]}")).andExpect(status().isOk());
        verify(planning).reorder(argThat(r -> r.scope().equals("projects") && r.ids().equals(List.of(id))));
    }
}
