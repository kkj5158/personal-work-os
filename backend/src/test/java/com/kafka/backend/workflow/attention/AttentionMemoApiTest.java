package com.kafka.backend.workflow.attention;

import com.kafka.backend.common.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static com.kafka.backend.workflow.attention.AttentionTypes.*;

@WebMvcTest(value=AttentionController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({AttentionSecurity.class,ProdSecurityConfig.class,ProdCurrentUserProvider.class,ApiExceptionHandler.class})
@ActiveProfiles("prod")
class AttentionMemoApiTest {
    @Autowired MockMvc mvc;@MockitoBean AttentionCredentials credentials;@MockitoBean AttentionService service;@MockitoBean JwtDecoder decoder;
    private final UUID item=UUID.randomUUID(),operation=UUID.randomUUID();
    private String path(){return "/api/workflow/attention/items/"+item+"/memo";}
    private String body(){return "{\"operationId\":\""+operation+"\",\"expectedMemoRevision\":0,\"memo\":\"한글 메모\\n다음 줄\"}";}
    @Test void existingDeviceCredentialMaySaveMemoThroughExactAllowlistedRoute()throws Exception{
        String token="aqd_"+"a".repeat(43);when(credentials.authenticate(token)).thenReturn(new AttentionAuthentication(UUID.randomUUID(),UUID.randomUUID(),"human","DEVICE"));
        mvc.perform(post(path()).header("Authorization","Bearer "+token).contentType("application/json").content(body())).andExpect(status().isOk());
        verify(service).memo(item,new Memo(operation,0L,"한글 메모\n다음 줄"));
        mvc.perform(post(path()+"/other").header("Authorization","Bearer "+token).contentType("application/json").content(body())).andExpect(status().isForbidden());
    }
    @Test void producerAndUnauthenticatedRequestsCannotSaveHumanMemo()throws Exception{
        String token="aqp_"+"a".repeat(43);when(credentials.authenticate(token)).thenReturn(new AttentionAuthentication(UUID.randomUUID(),UUID.randomUUID(),"team-kafka","PRODUCER"));
        mvc.perform(post(path()).header("Authorization","Bearer "+token).contentType("application/json").content(body())).andExpect(status().isForbidden());
        mvc.perform(post(path()).contentType("application/json").content(body())).andExpect(status().isUnauthorized());verify(service,never()).memo(any(),any());
    }
    @Test void memoConflictPreservesStructuredLatestAndQueueRevisionForRecovery()throws Exception{
        String token="aqd_"+"a".repeat(43);when(credentials.authenticate(token)).thenReturn(new AttentionAuthentication(UUID.randomUUID(),UUID.randomUUID(),"human","DEVICE"));
        var latest=new Item(item,"확인",null,"","확인",null,"OPEN",UUID.randomUUID(),0,0,1,5,new Source("CHATGPT","ref","https://chatgpt.com/c/ref","MANUAL","RESPONSE_COMPLETED","v1","ACK_ONLY",null),"key",null,null,null,null,null,"서버 최신",2L,null,null);
        when(service.memo(eq(item),any())).thenThrow(new AttentionException(409,"MEMO_REVISION_CONFLICT",latest,10L));
        mvc.perform(post(path()).header("Authorization","Bearer "+token).contentType("application/json").content(body())).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MEMO_REVISION_CONFLICT")).andExpect(jsonPath("$.latest.memo").value("서버 최신")).andExpect(jsonPath("$.latest.memoRevision").value(2)).andExpect(jsonPath("$.queueRevision").value(10)).andExpect(header().string("Cache-Control","no-store"));
    }
    @Test void fractionalRevisionsAndUnknownOwnerFieldsCannotBeCoercedIntoValidMemoWrites()throws Exception{
        String token="aqd_"+"a".repeat(43);when(credentials.authenticate(token)).thenReturn(new AttentionAuthentication(UUID.randomUUID(),UUID.randomUUID(),"human","DEVICE"));
        for(String invalid:new String[]{body().replace("\"expectedMemoRevision\":0","\"expectedMemoRevision\":0.5"),body().replace("\"expectedMemoRevision\":0","\"expectedMemoRevision\":9223372036854775808"),body().replace("\"expectedMemoRevision\":0","\"expectedMemoRevision\":\"0\""),body().replace("\"memo\":","\"ownerId\":\"foreign\",\"memo\":")})mvc.perform(post(path()).header("Authorization","Bearer "+token).contentType("application/json").content(invalid)).andExpect(status().isBadRequest());
        verify(service,never()).memo(any(),any());
    }
    @Test void conditionalSnapshot304ReturnsPrivateNoCacheTagWithoutBody()throws Exception{
        String token="aqd_"+"a".repeat(43),tag="\"attention-synthetic-1-hash\"";when(credentials.authenticate(token)).thenReturn(new AttentionAuthentication(UUID.randomUUID(),UUID.randomUUID(),"human","DEVICE"));when(service.conditionalSnapshot(tag)).thenReturn(new SnapshotRead(tag,null));
        mvc.perform(get("/api/workflow/attention/snapshot").header("Authorization","Bearer "+token).header("If-None-Match",tag)).andExpect(status().isNotModified()).andExpect(header().string("ETag",tag)).andExpect(header().string("Cache-Control","no-cache, private")).andExpect(content().string(""));verify(service).conditionalSnapshot(tag);verify(service,never()).snapshot();
    }
    @Test void conditionalSnapshot200ReturnsItsObservedSnapshotAndTag()throws Exception{
        String token="aqd_"+"a".repeat(43),tag="\"attention-synthetic-2-hash\"";when(credentials.authenticate(token)).thenReturn(new AttentionAuthentication(UUID.randomUUID(),UUID.randomUUID(),"human","DEVICE"));var snapshot=new Snapshot(2,java.util.List.of(),java.util.List.of(),java.time.Instant.now(),java.util.Map.of());when(service.conditionalSnapshot(null)).thenReturn(new SnapshotRead(tag,snapshot));
        mvc.perform(get("/api/workflow/attention/snapshot").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(header().string("ETag",tag)).andExpect(jsonPath("$.queueRevision").value(2));
    }
    @Test void v31ReadAndGroupRequireOwnerBrowserAuthenticationAndNeverExpandProducerOrDeviceScope()throws Exception{
        String feed="/api/workflow/attention/feed",group="/api/workflow/attention/items/"+item+"/group";
        mvc.perform(get(feed)).andExpect(status().isUnauthorized());mvc.perform(post(group).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        for(String kind:new String[]{"PRODUCER","DEVICE"}){
            String token=(kind.equals("DEVICE")?"aqd_":"aqp_")+"a".repeat(43);when(credentials.authenticate(token)).thenReturn(new AttentionAuthentication(UUID.randomUUID(),UUID.randomUUID(),"human",kind));
            mvc.perform(get(feed).header("Authorization","Bearer "+token)).andExpect(status().isForbidden());mvc.perform(post(group).header("Authorization","Bearer "+token).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        }
        verify(service,never()).feed(any(),any(),any(),any(),anyBoolean());verify(service,never()).group(any(),any());
    }
    @Test void v31FeedUsesPrivateEtagAndAuthenticatedOwnerGroupCommand()throws Exception{
        var response=new Feed(3,java.util.List.of(),null,java.util.Map.of("ACTIVE",0L,"COMPLETED",0L,"DEFERRED",0L),java.time.Instant.now(),"scope");String tag="\"attention-scope-3-hash\"";
        when(service.feed(null,null,null,null,false)).thenReturn(response);when(service.feedEtag(response)).thenReturn(tag);
        var jwt=org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt().jwt(j->j.subject(UUID.randomUUID().toString()));
        mvc.perform(get("/api/workflow/attention/feed").with(jwt)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-cache, private")).andExpect(jsonPath("$.totals.COMPLETED").value(0));
        mvc.perform(get("/api/workflow/attention/feed").with(jwt).header("If-None-Match",tag)).andExpect(status().isNotModified()).andExpect(content().string(""));
        mvc.perform(post("/api/workflow/attention/items/"+item+"/group").with(jwt).contentType("application/json").content("{\"operationId\":\""+operation+"\",\"expectedRevision\":0,\"expectedGeneration\":\"g\",\"group\":\"COMPLETED\"}")).andExpect(status().isOk());
        verify(service).group(item,new Group(operation,0L,"g","COMPLETED"));
    }

}
