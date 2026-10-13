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
}
