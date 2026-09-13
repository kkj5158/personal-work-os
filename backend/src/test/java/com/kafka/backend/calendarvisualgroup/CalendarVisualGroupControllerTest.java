package com.kafka.backend.calendarvisualgroup;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import java.time.*;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CalendarVisualGroupController.class)
@Import(DevSecurityConfig.class)
@ActiveProfiles("dev")
class CalendarVisualGroupControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean CalendarVisualGroupService service;
    @Test void normalizedPerDayJsonUsesSeparateCalendarApi()throws Exception{
        var date=LocalDate.of(2026,9,14);var id=UUID.randomUUID();
        when(service.create(any())).thenReturn(new VisualGroupResponse(id,"Context",date,date.plusMonths(1),VisualGroupTimeRule.PER_DAY,"#789abc",null,null,List.of(),
                List.of(new VisualGroupRequest.Day(date,true,LocalTime.of(9,5),LocalTime.of(18,5))),OffsetDateTime.now(),OffsetDateTime.now()));
        mvc.perform(post("/api/calendar/visual-groups").contentType(MediaType.APPLICATION_JSON).content("""
                {"title":"Context","startDate":"2026-09-14","endDate":"2026-10-14","timeRule":"PER_DAY","color":"#789abc",
                 "weekdays":[],"days":[{"date":"2026-09-14","enabled":true,"startTime":"09:05","endTime":"18:05"}]}
                """))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.days[0].enabled").value(true)).andExpect(jsonPath("$.days[0].startTime").value("09:05:00"));
        verify(service).create(argThat(r->r.days().getFirst().date().equals(date)&&r.days().getFirst().startTime().equals(LocalTime.of(9,5))));
    }
    @Test void listDeleteAndUndoMatchCalendarGrammar()throws Exception{
        var from=LocalDate.of(2026,9,14);var id=UUID.randomUUID();var token=UUID.randomUUID();
        when(service.list(from,from.plusDays(6))).thenReturn(List.of());
        when(service.delete(id)).thenReturn(new CalendarVisualGroupService.DeleteResult(token));
        mvc.perform(get("/api/calendar/visual-groups").param("from",from.toString()).param("to",from.plusDays(6).toString())).andExpect(status().isOk()).andExpect(content().json("[]"));
        mvc.perform(delete("/api/calendar/visual-groups/"+id)).andExpect(status().isOk()).andExpect(jsonPath("$.undoToken").value(token.toString()));
        mvc.perform(post("/api/calendar/visual-groups/undo/"+token)).andExpect(status().isOk());verify(service).restore(token);
    }
    @Test void unknownOwnerScopedGroupReturns404AndValidationRemains400()throws Exception{
        var id=UUID.randomUUID();when(service.get(id)).thenThrow(new ResourceNotFoundException("missing"));
        when(service.create(any())).thenThrow(new InvalidRequestException("invalid rule"));
        mvc.perform(get("/api/calendar/visual-groups/"+id)).andExpect(status().isNotFound());
        mvc.perform(post("/api/calendar/visual-groups").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("invalid rule"));
    }
}
