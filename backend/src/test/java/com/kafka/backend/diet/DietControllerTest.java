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
    @Test void linkedFinalDeletionValidationReturns400()throws Exception {
        var id=UUID.randomUUID();doThrow(new InvalidRequestException("도전의 최종 목표는 도전에서 관리하세요.")).when(service).delete("goals",id);
        mvc.perform(delete("/api/diet/goals/"+id)).andExpect(status().isBadRequest());
    }
}
