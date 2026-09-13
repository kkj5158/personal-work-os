package com.kafka.backend.notesystem;
import com.kafka.backend.common.DevSecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import java.util.UUID;
import java.util.List;
import java.time.LocalDate;
import static com.kafka.backend.notesystem.NoteTypes.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(NoteSystemController.class) @Import(DevSecurityConfig.class) @ActiveProfiles("dev")
class NoteSystemControllerTest {
 @Autowired MockMvc mvc; @MockitoBean NoteSystemService service;
 @Test void workspaceJsonMatchesBrowserContract()throws Exception {
  UUID id=UUID.randomUUID();when(service.createWorkspace(any())).thenReturn(id);
  mvc.perform(post("/api/note-system/workspaces").contentType(MediaType.APPLICATION_JSON).content("""
    {"name":"테스트","description":"","icon":"notebook","archived":false,"modules":null}
    """)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id.toString()));
 }
 @Test void dailyHubSettingsAndDateContracts()throws Exception {
  UUID w=UUID.randomUUID();
  when(service.dailyHubSettings()).thenReturn(new DailyHubSettings(List.of(w),false));
  mvc.perform(get("/api/note-system/daily-hub/settings")).andExpect(status().isOk()).andExpect(jsonPath("$.includedWorkspaceIds[0]").value(w.toString())).andExpect(jsonPath("$.autoIncludeNewWorkspaces").value(false));
  when(service.dailyHubSettings(any(DailyHubSettings.class))).thenAnswer(call->call.getArgument(0));
  mvc.perform(put("/api/note-system/daily-hub/settings").contentType(MediaType.APPLICATION_JSON).content("{\"includedWorkspaceIds\":[\""+w+"\"],\"autoIncludeNewWorkspaces\":true}")).andExpect(status().isOk()).andExpect(jsonPath("$.autoIncludeNewWorkspaces").value(true));
  LocalDate date=LocalDate.of(2026,9,13);
  when(service.dailyHubRecords(date,31)).thenReturn(List.of(new DailyHubRecord(date,2)));
  mvc.perform(get("/api/note-system/daily-hub/records").param("end",date.toString())).andExpect(status().isOk()).andExpect(jsonPath("$[0].date").value(date.toString())).andExpect(jsonPath("$[0].workspaceCount").value(2));
  mvc.perform(get("/api/note-system/daily-hub").param("date",date.toString())).andExpect(status().isOk());
  verify(service).dailyHub(date);
  mvc.perform(get("/api/note-system/daily-hub/recent")).andExpect(status().isOk());
  verify(service).dailyHubRecent(30);
 }
 @Test void dailyHubRejectsInvalidDateAndNullWorkspaceIds()throws Exception {
  mvc.perform(get("/api/note-system/daily-hub").param("date","invalid")).andExpect(status().isBadRequest());
  mvc.perform(put("/api/note-system/daily-hub/settings").contentType(MediaType.APPLICATION_JSON).content("{\"includedWorkspaceIds\":[null],\"autoIncludeNewWorkspaces\":false}")).andExpect(status().isBadRequest());
  mvc.perform(put("/api/note-system/daily-hub/settings").contentType(MediaType.APPLICATION_JSON).content("{\"autoIncludeNewWorkspaces\":false}")).andExpect(status().isBadRequest());
 }
 @Test void invalidNameAndDateAreClientErrors()throws Exception {
  mvc.perform(post("/api/note-system/workspaces").contentType(MediaType.APPLICATION_JSON).content("""
    {"name":"","description":"","icon":"notebook","archived":false,"modules":null}
    """)).andExpect(status().isBadRequest());
  mvc.perform(get("/api/note-system/workspaces/{id}/daily",UUID.randomUUID()).param("end","not-a-date")).andExpect(status().isBadRequest());
 }
 @Test void voidResponsesAre204()throws Exception {mvc.perform(post("/api/note-system/workspaces/{w}/notes/{id}/visit",UUID.randomUUID(),UUID.randomUUID())).andExpect(status().isNoContent());}
 @Test void browserNoteWriteCarriesExpectedVersion()throws Exception {
  UUID w=UUID.randomUUID(),id=UUID.randomUUID();mvc.perform(put("/api/note-system/workspaces/{w}/notes",w).contentType(MediaType.APPLICATION_JSON).content("{\"id\":\""+id+"\",\"journalDate\":null,\"title\":\"한글\",\"content\":\"본문\",\"expectedVersion\":3}")).andExpect(status().isOk());
  verify(service).save(eq(w),argThat(n->n.expectedVersion()==3&&n.content().equals("본문")));
 }
}
