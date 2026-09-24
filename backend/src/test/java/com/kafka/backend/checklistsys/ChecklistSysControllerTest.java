package com.kafka.backend.checklistsys;

import com.kafka.backend.common.DevSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static com.kafka.backend.checklistsys.ChecklistSysTypes.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ChecklistSysController.class) @Import(DevSecurityConfig.class) @ActiveProfiles("dev")
class ChecklistSysControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean ChecklistSysService service;

    @Test void catalogAndRecordsMatchBrowserContract() throws Exception {
        when(service.catalog()).thenReturn(new Catalog(List.of(), List.of(), List.of(), List.of()));
        mvc.perform(get("/api/checklist-sys")).andExpect(status().isOk()).andExpect(jsonPath("$.archivePeriods").isArray());
        when(service.records(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30))).thenReturn(List.of());
        mvc.perform(get("/api/checklist-sys/records?from=2026-09-01&to=2026-09-30")).andExpect(status().isOk()).andExpect(jsonPath("$").isArray());
    }

    @Test void nullStateClearsAndNotRecordedIsItsOwnState() throws Exception {
        UUID item = UUID.randomUUID();
        mvc.perform(put("/api/checklist-sys/records").contentType(MediaType.APPLICATION_JSON)
                .content("{\"changes\":[{\"itemId\":\"" + item + "\",\"date\":\"2026-09-20\",\"state\":\"NOT_RECORDED\"},{\"itemId\":\"" + item + "\",\"date\":\"2026-09-21\",\"state\":null}]}"))
                .andExpect(status().isNoContent());
        verify(service).saveRecords(argThat(in -> in.changes().get(0).state() == RecordState.NOT_RECORDED && in.changes().get(1).state() == null));
    }

    @Test void archiveAndRestoreAreCommandsNotDeletes() throws Exception {
        UUID item = UUID.randomUUID();
        mvc.perform(post("/api/checklist-sys/items/" + item + "/archive")).andExpect(status().isNoContent());
        mvc.perform(post("/api/checklist-sys/items/" + item + "/restore")).andExpect(status().isNoContent());
        mvc.perform(delete("/api/checklist-sys/items/" + item)).andExpect(status().is4xxClientError());
        verify(service).archiveItem(item);
        verify(service).restoreItem(item);
    }

    @Test void malformedStatesAndDatesAreClientErrors() throws Exception {
        mvc.perform(put("/api/checklist-sys/records").contentType(MediaType.APPLICATION_JSON)
                .content("{\"changes\":[{\"itemId\":\"" + UUID.randomUUID() + "\",\"date\":\"2026-09-20\",\"state\":\"UNKNOWN\"}]}"))
                .andExpect(status().isBadRequest());
        verify(service, never()).saveRecords(any());
    }
}
