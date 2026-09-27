package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import java.time.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Actual PROD filter/provider and Camera controller/service; DB fixtures stay in memory. */
@WebMvcTest(value=DietCameraMediaController.class,properties={"app.db-environment=PROD",
 "app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid",
 "app.cors.allowed-origins=https://example.invalid"})
@Import({DietCameraMediaService.class,ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class DietCameraSecurityTest {
 @Autowired MockMvc mvc;
 @MockitoBean JdbcTemplate db;
 @MockitoBean JwtDecoder jwtDecoder;
 @MockitoBean DietNoteSync sync;
 @Test void anonymousCannotReadCreateMutateOrReconcile()throws Exception{
  String path="/api/diet/camera-media/"+UUID.randomUUID();
  for(String suffix:List.of("","/session"))mvc.perform(get("/api/diet/camera-media"+suffix)).andExpect(status().isUnauthorized());
  mvc.perform(get(path)).andExpect(status().isUnauthorized());
  mvc.perform(get(path+"/image")).andExpect(status().isUnauthorized());
  mvc.perform(put(path).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
  mvc.perform(post(path+"/reconcile")).andExpect(status().isUnauthorized());
  verifyNoInteractions(db,sync);
 }
 @Test void verifiedSubjectOwnsSessionAndEveryReadEvenWithForgedOwnerParameter()throws Exception{
  UUID owner=UUID.randomUUID(),client=UUID.randomUUID();
  mvc.perform(get("/api/diet/camera-media/session").param("ownerId",UUID.randomUUID().toString()).with(jwt().jwt(j->j.subject(owner.toString()))))
   .andExpect(status().isOk()).andExpect(jsonPath("$.ownerId").value(owner.toString())).andExpect(jsonPath("$.environment").value("PROD"));
  mvc.perform(get("/api/diet/camera-media").param("ownerId",UUID.randomUUID().toString()).with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isOk());
  verify(db).query(anyString(),any(RowMapper.class),eq(owner));
  mvc.perform(get("/api/diet/camera-media/"+client).with(jwt().jwt(j->j.subject(owner.toString())))).andExpect(status().isNotFound());
  verify(db).query(anyString(),any(RowMapper.class),eq(owner),eq(client));
 }
 @Test void authenticatedCreationUsesVerifiedOwnerAndPreservesCapture()throws Exception{
  UUID owner=UUID.randomUUID(),client=UUID.randomUUID();Instant at=Instant.parse("2026-01-01T15:00:00Z");
  var stream=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(2,2,BufferedImage.TYPE_INT_RGB),"jpeg",stream);
  byte[] data=stream.toByteArray();String sha=DietCameraMediaService.digest(data);
  var saved=new DietCameraMediaService.Media(UUID.randomUUID(),client,at,540,LocalDate.of(2026,1,2),UUID.randomUUID(),sha,null,null,1,false,null,false);
  when(db.query(anyString(),any(RowMapper.class),eq(owner),eq(client))).thenReturn(List.of(),List.of(saved));
  String body="{\"capturedAt\":\""+at+"\",\"offsetMinutes\":540,\"sha256\":\""+sha+"\",\"memo\":null,\"deletedAt\":null,\"revision\":1,\"purge\":false,\"data\":\""+Base64.getEncoder().encodeToString(data)+"\"}";
  mvc.perform(put("/api/diet/camera-media/"+client).with(jwt().jwt(j->j.subject(owner.toString()))).contentType("application/json").content(body))
   .andExpect(status().isOk()).andExpect(jsonPath("$.clientMediaId").value(client.toString())).andExpect(jsonPath("$.capturedDate").value("2026-01-02"));
  verify(sync).project(List.of(LocalDate.of(2026,1,2)));
  org.assertj.core.api.Assertions.assertThat(mockingDetails(db).getInvocations().stream()
   .filter(i->i.getMethod().getName().equals("update")&&i.getArgument(0).toString().startsWith("insert into diet_camera_media"))
   .findFirst().orElseThrow().getArguments()).contains(owner,client);
 }
}
