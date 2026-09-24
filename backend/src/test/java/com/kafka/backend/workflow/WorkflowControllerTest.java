package com.kafka.backend.workflow;

import com.kafka.backend.common.DevSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(WorkflowController.class) @Import(DevSecurityConfig.class) @ActiveProfiles("dev")
class WorkflowControllerTest {
    @Autowired MockMvc mvc;@MockitoBean WorkflowService service;
    @Test void aggregateAndDayMatchBrowserContract()throws Exception {
        when(service.all()).thenReturn(new Aggregate(List.of(),List.of(),List.of()));
        mvc.perform(get("/api/workflow")).andExpect(status().isOk()).andExpect(jsonPath("$.projects").isArray()).andExpect(jsonPath("$.tasks").isArray());
        var date=LocalDate.of(2026,9,14);when(service.day(date)).thenReturn(new Day(date,3,List.of()));
        mvc.perform(get("/api/workflow/days/2026-09-14")).andExpect(status().isOk()).andExpect(jsonPath("$.date").value("2026-09-14")).andExpect(jsonPath("$.revision").value(3));
        mvc.perform(put("/api/workflow/days/2026-09-14").contentType(MediaType.APPLICATION_JSON).content("{\"date\":\"2026-09-14\",\"revision\":3,\"blocks\":[]}")).andExpect(status().isOk());
        verify(service).saveDay(eq(date),argThat((DaySave d)->d.revision()==3&&d.blocks().isEmpty()&&d.taskTitles()==null));
    }
    @Test void taskPromotionAndTodayRoutesAcceptUuidAndDate()throws Exception {
        UUID id=UUID.randomUUID();LocalDate day=LocalDate.of(2026,9,14);
        mvc.perform(post("/api/workflow/days/2026-09-14/promote").contentType(MediaType.APPLICATION_JSON).content("{\"blockId\":\""+id+"\"}")).andExpect(status().isOk());verify(service).promote(day,id);
        mvc.perform(post("/api/workflow/tasks/"+id+"/today").contentType(MediaType.APPLICATION_JSON).content("{\"date\":\"2026-09-14\"}")).andExpect(status().isOk());verify(service).addToday(id,day);
        mvc.perform(get("/api/workflow/days/not-a-date")).andExpect(status().isBadRequest());
    }
    @Test void deleteReturnsNoContent()throws Exception {
        for(String entity:List.of("projects","phases","tasks"))mvc.perform(delete("/api/workflow/"+entity+"/"+UUID.randomUUID())).andExpect(status().isNoContent());
    }
    @Test void moveAndUndoReturnBothDocumentsAndRequireExpectedRevisionsInContract()throws Exception {
        var date=LocalDate.of(2026,9,14);var target=date.plusDays(3);
        UUID block=UUID.randomUUID(),token=UUID.randomUUID();
        var result=new MoveResult(new Day(date,5,List.of()),new Day(target,2,List.of()),List.of(block),token);
        when(service.move(eq(date),any())).thenReturn(result);
        mvc.perform(post("/api/workflow/days/2026-09-14/move").contentType(MediaType.APPLICATION_JSON)
            .content("{\"blockIds\":[\""+block+"\"],\"targetDate\":\"2026-09-17\",\"expectedSourceRevision\":4,\"expectedTargetRevision\":1,\"incompleteOnly\":true}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.source.revision").value(5))
            .andExpect(jsonPath("$.target.date").value("2026-09-17")).andExpect(jsonPath("$.undoToken").value(token.toString()));
        verify(service).move(eq(date),argThat(in->in.expectedSourceRevision()==4&&in.expectedTargetRevision()==1&&in.incompleteOnly()&&in.blockIds().equals(List.of(block))));
        when(service.undoMove(token)).thenReturn(result);
        mvc.perform(post("/api/workflow/moves/"+token+"/undo")).andExpect(status().isOk()).andExpect(jsonPath("$.source.date").value("2026-09-14"));
        verify(service).undoMove(token);
    }
    @Test void moveAllowsOmittingOptionalIncompleteOnlyFlag()throws Exception {
        UUID block=UUID.randomUUID();
        mvc.perform(post("/api/workflow/days/2026-09-14/move").contentType(MediaType.APPLICATION_JSON)
            .content("{\"blockIds\":[\""+block+"\"],\"targetDate\":\"2026-09-17\",\"expectedSourceRevision\":4,\"expectedTargetRevision\":1}"))
            .andExpect(status().isOk());
        verify(service).move(eq(LocalDate.of(2026,9,14)),argThat(in->!Boolean.TRUE.equals(in.incompleteOnly())));
    }
    @Test void daySaveAcceptsOptionalAtomicTaskTitleMap()throws Exception {
        UUID task=UUID.randomUUID();
        mvc.perform(put("/api/workflow/days/2026-09-14").contentType(MediaType.APPLICATION_JSON)
            .content("{\"revision\":4,\"blocks\":[],\"taskTitles\":{\""+task+"\":\"Edited\"}}"))
            .andExpect(status().isOk());
        verify(service).saveDay(eq(LocalDate.of(2026,9,14)),argThat((DaySave in)->in.revision()==4&&in.taskTitles().equals(Map.of(task,"Edited"))));
    }
}
