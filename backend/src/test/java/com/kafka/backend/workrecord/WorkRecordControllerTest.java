package com.kafka.backend.workrecord;

import com.kafka.backend.common.DevSecurityConfig;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.OptimisticLockConflictException;
import com.kafka.backend.common.ResourceNotFoundException;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryService;
import com.kafka.backend.worktimeentry.WorkTimeEntry;
import com.kafka.backend.worktimeentry.WorkTimeEntryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

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
@ActiveProfiles("dev")
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

    @MockitoBean
    private SupplementalWorkEntryService supplementalWorkEntryService;

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
        when(supplementalWorkEntryService.findByWorkRecord(record.getId())).thenReturn(List.of());

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
    void listBatchesEntriesAndPreservesTheFullOrderedResponseContract() throws Exception {
        UUID categoryId = UUID.randomUUID();
        UUID criterionId = UUID.randomUUID();
        WorkRecord firstRecord = new WorkRecord(UUID.randomUUID(), DATE.minusDays(1));
        firstRecord.applyChanges(
                WorkAttendanceStatus.WORK,
                OffsetDateTime.parse("2026-08-23T09:05:00+09:00"),
                OffsetDateTime.parse("2026-08-23T18:00:00+09:00"),
                535,
                "HOME",
                88,
                "historical memo",
                criterionId,
                "09시 기준",
                LocalTime.of(9, 0),
                10,
                true,
                OffsetDateTime.parse("2026-08-24T10:00:00+09:00")
        );
        WorkRecord secondRecord = new WorkRecord(UUID.randomUUID(), DATE);
        secondRecord.applyChanges(
                WorkAttendanceStatus.PAID_LEAVE,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                false,
                null
        );
        WorkTimeEntry firstEntry = new WorkTimeEntry(UUID.randomUUID(), firstRecord.getUserId(), firstRecord.getId(), categoryId, "기획", 30, null, 0);
        WorkTimeEntry secondEntry = new WorkTimeEntry(UUID.randomUUID(), firstRecord.getUserId(), firstRecord.getId(), categoryId, "개발", 60, "집중", 1);
        List<UUID> recordIds = List.of(firstRecord.getId(), secondRecord.getId());

        when(service.listInRange(DATE.minusDays(1), DATE)).thenReturn(List.of(firstRecord, secondRecord));
        when(workTimeEntryService.findByWorkRecordIds(recordIds)).thenReturn(Map.of(firstRecord.getId(), List.of(firstEntry, secondEntry)));
        when(supplementalWorkEntryService.findByWorkRecordIds(recordIds)).thenReturn(Map.of());

        mockMvc.perform(get("/api/work-records").param("from", DATE.minusDays(1).toString()).param("to", DATE.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].workDate").value(DATE.minusDays(1).toString()))
                .andExpect(jsonPath("$[0].status").value("WORK"))
                .andExpect(jsonPath("$[0].workLocation").value("HOME"))
                .andExpect(jsonPath("$[0].workScore").value(88))
                .andExpect(jsonPath("$[0].memo").value("historical memo"))
                .andExpect(jsonPath("$[0].appliedCriterionId").value(criterionId.toString()))
                .andExpect(jsonPath("$[0].appliedCriterionName").value("09시 기준"))
                .andExpect(jsonPath("$[0].appliedStartTime").value("09:00:00"))
                .andExpect(jsonPath("$[0].appliedGraceMinutes").value(10))
                .andExpect(jsonPath("$[0].latenessMinutes").value(0))
                .andExpect(jsonPath("$[0].isOnTimeOverride").value(true))
                .andExpect(jsonPath("$[0].absenceCorrectedAt").value("2026-08-24T10:00:00+09:00"))
                .andExpect(jsonPath("$[0].workTimeEntries[0].item").value("기획"))
                .andExpect(jsonPath("$[0].workTimeEntries[0].position").value(0))
                .andExpect(jsonPath("$[0].workTimeEntries[1].item").value("개발"))
                .andExpect(jsonPath("$[0].workTimeEntries[1].position").value(1))
                .andExpect(jsonPath("$[0].netWorkMinutes").value(90))
                .andExpect(jsonPath("$[0].supplementalWorkEntries").isEmpty())
                .andExpect(jsonPath("$[0].supplementalWorkMinutes").value(0))
                .andExpect(jsonPath("$[1].workDate").value(DATE.toString()))
                .andExpect(jsonPath("$[1].status").value("PAID_LEAVE"))
                .andExpect(jsonPath("$[1].workTimeEntries").isEmpty())
                .andExpect(jsonPath("$[1].netWorkMinutes").value(0))
                .andExpect(jsonPath("$[1].supplementalWorkEntries").isEmpty())
                .andExpect(jsonPath("$[1].supplementalWorkMinutes").value(0));

        verify(workTimeEntryService).findByWorkRecordIds(recordIds);
        verify(workTimeEntryService, never()).findByWorkRecord(any());
        verify(supplementalWorkEntryService).findByWorkRecordIds(recordIds);
        verify(supplementalWorkEntryService, never()).findByWorkRecord(any());
    }

    @Test
    void upsertReturnsOkOnSuccess() throws Exception {
        WorkRecord record = new WorkRecord(UUID.randomUUID(), DATE);
        when(service.upsert(eq(DATE), any())).thenReturn(record);
        when(workTimeEntryService.findByWorkRecord(record.getId())).thenReturn(List.of());
        when(supplementalWorkEntryService.findByWorkRecord(record.getId())).thenReturn(List.of());

        WorkRecordRequest request = new WorkRecordRequest(
                WorkAttendanceStatus.WORK, LocalTime.of(9, 0), null, null, null, null, null, null, null, null, null
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
                WorkAttendanceStatus.WORK, null, null, null, null, null, null, 0, null, null, null
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
                WorkAttendanceStatus.WORK, null, null, null, null, null, UUID.randomUUID(), null, null, null, null
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
                WorkAttendanceStatus.WORK, null, null, null, null, null, null, 0, null, null, null
        );

        mockMvc.perform(post("/api/work-records/{date}/absence-correction", DATE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }
}
