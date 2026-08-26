package com.kafka.backend.workrecord;

import com.kafka.backend.common.DevSecurityConfig;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.OptimisticLockConflictException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.worktimeentry.WorkTimeEntryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP-contract tests for {@link WorkRecordController} — status codes and
 * the {@code ApiExceptionHandler} mapping, not business logic (already
 * covered by {@link WorkRecordServiceTest}). Confirms the documented
 * contract in docs/backend/work-record.md §3/§6: 204 for a missing record,
 * 404/400/409 mapped from the service's exceptions, never a raw 500 with
 * exception detail.
 */
@WebMvcTest(WorkRecordController.class)
@Import(DevSecurityConfig.class)
class WorkRecordControllerTest {

    private static final LocalDate DATE = LocalDate.of(2026, 8, 24);

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private WorkRecordService service;

    @MockitoBean
    private WorkTimeEntryService workTimeEntryService;

    @Test
    void detailReturnsNoContentWhenNoRecordExists() throws Exception {
        when(service.find(DATE)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/work-records/{date}", DATE))
                .andExpect(status().isNoContent());
    }

    @Test
    void detailReturnsTheRecordWhenItExists() throws Exception {
        WorkRecord record = new WorkRecord(UUID.randomUUID(), DATE);
        when(service.find(DATE)).thenReturn(Optional.of(record));
        when(workTimeEntryService.findByWorkRecord(record.getId())).thenReturn(List.of());

        mockMvc.perform(get("/api/work-records/{date}", DATE))
                .andExpect(status().isOk());
    }

    @Test
    void listRejectsAnInvalidRangeAsBadRequest() throws Exception {
        when(service.listInRange(any(), any())).thenThrow(new InvalidRequestException("to must not be before from"));

        mockMvc.perform(get("/api/work-records").param("from", "2026-08-31").param("to", "2026-08-01"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void upsertReturnsOkOnSuccess() throws Exception {
        WorkRecord record = new WorkRecord(UUID.randomUUID(), DATE);
        when(service.upsert(eq(DATE), any())).thenReturn(record);
        when(workTimeEntryService.findByWorkRecord(record.getId())).thenReturn(List.of());

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, LocalTime.of(9, 0), null, null, null, null, null, null, null, null
        );

        mockMvc.perform(put("/api/work-records/{date}", DATE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk());
    }

    @Test
    void upsertReturnsConflictOnStaleVersion() throws Exception {
        when(service.upsert(eq(DATE), any())).thenThrow(new OptimisticLockConflictException("stale version"));

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, null, null, null, null, null, null, 0, null, null
        );

        mockMvc.perform(put("/api/work-records/{date}", DATE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isConflict());
    }

    @Test
    void upsertReturnsNotFoundForAForeignOrMissingCriterion() throws Exception {
        when(service.upsert(eq(DATE), any())).thenThrow(new ResourceNotFoundException("Start time criterion not found"));

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, null, null, null, null, null, UUID.randomUUID(), null, null, null
        );

        mockMvc.perform(put("/api/work-records/{date}", DATE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound());
    }

    @Test
    void clockInReturnsBadRequestWhenNotEligible() throws Exception {
        when(service.clockIn(eq(DATE), any())).thenThrow(new InvalidRequestException("not eligible"));

        mockMvc.perform(post("/api/work-records/{date}/clock-in", DATE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new WorkRecordActionRequest(0))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void absenceCorrectionReturnsBadRequestWhenNotCurrentlyAbsent() throws Exception {
        when(service.correctAbsence(eq(DATE), any())).thenThrow(new InvalidRequestException("not absent"));

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, null, null, null, null, null, null, 0, null, null
        );

        mockMvc.perform(post("/api/work-records/{date}/absence-correction", DATE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }
}
