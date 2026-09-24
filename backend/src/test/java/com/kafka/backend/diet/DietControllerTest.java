package com.kafka.backend.diet;

import com.kafka.backend.common.DevSecurityConfig;
import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import java.util.*;
import static com.kafka.backend.diet.DietTypes.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DietController.class) @Import(DevSecurityConfig.class) @ActiveProfiles("dev")
class DietControllerTest {
    @Autowired MockMvc mvc; @MockitoBean DietService service;
    @Test void aggregateAndEmptyWriteResponsesMatchBrowserContract()throws Exception {
        when(service.data()).thenReturn(new Data(List.of(),List.of(),List.of(),List.of(),List.of(),List.of(),Map.of()));
        mvc.perform(get("/api/diet")).andExpect(status().isOk()).andExpect(jsonPath("$.days").isArray()).andExpect(jsonPath("$.settings").isMap());
        mvc.perform(put("/api/diet/days/2026-09-14").contentType(MediaType.APPLICATION_JSON).content("{\"morningWeight\":91.2}")).andExpect(status().isNoContent());
        verify(service).day(any(),argThat(d->d.morningWeight()==91.2&&d.morningGlucose()==null));
        mvc.perform(put("/api/diet/items/order").contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[]}")).andExpect(status().isNoContent());
        verify(service).order(eq("items"),any());
    }
    @Test void malformedEnumsAreClientErrors()throws Exception {
        mvc.perform(put("/api/diet/checks/2026-09-14/"+UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON).content("{\"state\":\"UNKNOWN\"}")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
    @Test void malformedDatesAndIdsAreClientErrors()throws Exception {
        mvc.perform(put("/api/diet/days/invalid").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        mvc.perform(delete("/api/diet/items/invalid")).andExpect(status().isBadRequest());
    }
    @Test void homeOrderUsesTypeScopedRoute()throws Exception {
        mvc.perform(put("/api/diet/challenges/home-order").contentType(MediaType.APPLICATION_JSON).content("{\"type\":\"CHECKLIST\",\"ids\":[]}")).andExpect(status().isNoContent());
        verify(service).homeOrder(argThat(o->o.type()==ChallengeType.CHECKLIST));
    }
    @Test void unrecordedAndGoalBaselinesCrossTheJsonBoundary()throws Exception {
        var item=UUID.randomUUID();var goalId=UUID.randomUUID();
        mvc.perform(put("/api/diet/checks/2026-09-14/"+item).contentType(MediaType.APPLICATION_JSON).content("""
            {"state":"UNRECORDED","memo":"Travel"}
            """)).andExpect(status().isNoContent());
        verify(service).check(any(),eq(item),argThat(c->c.state()==CheckState.UNRECORDED&&c.memo().equals("Travel")));
        mvc.perform(put("/api/diet/goals/"+goalId).contentType(MediaType.APPLICATION_JSON).content("""
            {"kind":"WEEKLY","targetDate":"2026-09-21","targetWeight":80,"baselineDate":"2026-09-14","baselineWeight":90,"core":"","memoItems":[]}
            """)).andExpect(status().isNoContent());
        verify(service).goal(eq(goalId),argThat(g->g.baselineDate().toString().equals("2026-09-14")&&g.baselineWeight()==90d));
        var goal=new WeightGoal(goalId,GoalKind.WEEKLY,java.time.LocalDate.of(2026,9,21),80d,"",List.of(),java.time.LocalDate.of(2026,9,14),90d);
        when(service.data()).thenReturn(new Data(List.of(),List.of(),List.of(),List.of(),List.of(goal),List.of(),Map.of()));
        mvc.perform(get("/api/diet")).andExpect(status().isOk()).andExpect(jsonPath("$.goals[0].baselineDate").value("2026-09-14")).andExpect(jsonPath("$.goals[0].baselineWeight").value(90));
    }
    @Test void slotMeasuredTimesCrossTheJsonBoundaryAsSeoulLocalDateTimes()throws Exception {
        mvc.perform(put("/api/diet/days/2026-09-14").contentType(MediaType.APPLICATION_JSON).content("""
            {"morningBloodKetone":1.2,"morningBreathKetone":14,"morningMeasuredAt":"2026-09-14T23:40:05","bedtimeMeasuredAt":null}
            """)).andExpect(status().isNoContent());
        verify(service).day(any(),argThat(d->d.morningMeasuredAt().toString().equals("2026-09-14T23:40:05")&&d.bedtimeMeasuredAt()==null
            &&d.morningBloodKetone()==1.2&&d.morningBreathKetone()==14d));
        var day=new DailyRecord(java.time.LocalDate.of(2026,9,14),null,null,null,null,95d,null,null,null,null,null,null,java.time.LocalDateTime.of(2026,9,14,15,30,5));
        when(service.data()).thenReturn(new Data(List.of(day),List.of(),List.of(),List.of(),List.of(),List.of(),Map.of()));
        mvc.perform(get("/api/diet")).andExpect(status().isOk()).andExpect(jsonPath("$.days[0].bedtimeMeasuredAt").value("2026-09-14T15:30:05"))
            .andExpect(jsonPath("$.days[0].bedtimeGlucose").value(95));
    }
}
