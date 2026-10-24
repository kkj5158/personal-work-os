package com.kafka.backend.timetable;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(value=TimetableController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class TimetableSecurityTest {
 @Autowired MockMvc mvc;@MockitoBean TimetableService service;@MockitoBean JwtDecoder decoder;
 @Test void everySurfaceRequiresAuthentication()throws Exception{
  String root="/api/calendar/timetables",t="/"+UUID.randomUUID(),b="/blocks/"+UUID.randomUUID();
  for(String path:List.of("","/context",t,t+"/philosophy",t+"/blocks"))mvc.perform(get(root+path)).andExpect(status().isUnauthorized());
  for(String path:List.of("/order",t,t+"/archive",t+"/philosophy",t+b,t+"/block-groups/"+UUID.randomUUID()))mvc.perform(put(root+path).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
  for(String path:List.of("",t+"/duplicate",t+"/blocks",t+b+"/restore"))mvc.perform(post(root+path).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
  mvc.perform(delete(root+t+b+"?version=0")).andExpect(status().isUnauthorized());verifyNoInteractions(service);
  mvc.perform(put(root+t+"/block-groups/"+UUID.randomUUID()+"/placement").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());verifyNoInteractions(service);
 }
 @Test void ownerCannotBeSuppliedByClientAndErrorsKeepTheirStatus()throws Exception{
  var id=UUID.randomUUID();when(service.context()).thenReturn(Map.of("ownerId",id));
  mvc.perform(get("/api/calendar/timetables/context?ownerId=untrusted").with(jwt())).andExpect(status().isOk()).andExpect(jsonPath("$.ownerId").value(id.toString()));
  when(service.get(id)).thenThrow(new ResourceNotFoundException("missing"));mvc.perform(get("/api/calendar/timetables/"+id).with(jwt())).andExpect(status().isNotFound());
  when(service.savePhilosophy(eq(id),any())).thenThrow(new OptimisticLockConflictException("stale"));mvc.perform(put("/api/calendar/timetables/"+id+"/philosophy").with(jwt()).contentType("application/json").content("{\"version\":0,\"content\":\"draft\",\"ownerId\":\"untrusted\"}")).andExpect(status().isConflict());
 }
 @Test void creationRequiresRetryIdentity()throws Exception{mvc.perform(post("/api/calendar/timetables").with(jwt()).contentType("application/json").content("{\"title\":\"new\"}")).andExpect(status().isBadRequest());verifyNoInteractions(service);}
 @Test void groupSaveRequiresRetryIdentityAndStrictMemberVersions()throws Exception{
  String path="/api/calendar/timetables/"+UUID.randomUUID()+"/block-groups/"+UUID.randomUUID();
  for(String target:List.of(path,path+"/placement")){
   mvc.perform(put(target).with(jwt()).contentType("application/json").content("{}")).andExpect(status().isBadRequest());
   mvc.perform(put(target).with(jwt()).header("Idempotency-Key",UUID.randomUUID()).contentType("application/json").content("{\"members\":[{\"id\":\""+UUID.randomUUID()+"\",\"version\":0.5}]}")).andExpect(status().isBadRequest());
  }verifyNoInteractions(service);
 }
 @Test void fractionalTimingAndVersionsAreNeverSilentlyRounded()throws Exception{var id=UUID.randomUUID();for(String body:List.of("{\"version\":0.1}","{\"weekday\":1.5}","{\"startMinute\":540.5}","{\"durationMinutes\":60.5}","null"))mvc.perform(put("/api/calendar/timetables/"+id+"/blocks/"+UUID.randomUUID()).with(jwt()).contentType("application/json").content(body)).andExpect(status().isBadRequest());verifyNoInteractions(service);}
}
