package com.kafka.backend.naverarchive;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;
import com.kafka.backend.common.ProdSecurityConfig;
import com.kafka.backend.orbit.OrbitMoneyProofFilter;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
@WebMvcTest(value=ArchiveController.class,properties={"app.supabase.jwks-uri=https://example.invalid/jwks","app.supabase.issuer=https://example.invalid","app.cors.allowed-origins=http://localhost:3000"})
@Import({ProdSecurityConfig.class,ArchivePrivacyFilter.class})
@ActiveProfiles("hosted-dev")
class ArchiveSecurityTest {
 @Autowired MockMvc mvc;@MockitoBean ArchiveService s;@MockitoBean ArchiveImports imports;@MockitoBean JwtDecoder decoder;
 static final String ID="00000000-0000-4000-8000-000000000001";
 @Test void anonymousReadAndWriteAllFamiliesDenied()throws Exception{for(String p:List.of("/posts","/summary","/posts/"+ID,"/posts/"+ID+"/revisions","/assets/"+ID,"/imports/"+ID,"/operations/"+ID))mvc.perform(get("/api/naver-archive"+p)).andExpect(status().isUnauthorized());for(String p:List.of("/posts","/posts/duplicate-check","/posts/"+ID+"/archive","/posts/"+ID+"/restore","/imports/preview","/imports/"+ID+"/execute"))mvc.perform(post("/api/naver-archive"+p).contentType("application/json").content("{}")).andExpect(status().isUnauthorized());verifyNoInteractions(s,imports);}
 @Test void invalidJwtNeverReachesDomain()throws Exception{when(decoder.decode(anyString())).thenThrow(new BadJwtException("invalid"));mvc.perform(get("/api/naver-archive/posts").header("Authorization","Bearer bad")).andExpect(status().isUnauthorized());verifyNoInteractions(s,imports);}
 @Test void ownershipAndConflictHaveGenericStatusNoBodyLeak()throws Exception{when(s.get(any())).thenThrow(new ArchiveException(404,"글을 찾을 수 없습니다."));mvc.perform(get("/api/naver-archive/posts/"+ID).with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt())).andExpect(status().isNotFound()).andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.message").value("글을 찾을 수 없습니다."));}
 @Test void proofCannotReuseMoneyScopePurposePathBodyOrSubject(){String issuer="https://orbit-pos-mcp-dev-development.up.railway.app",audience="https://workflow-api-development-development.up.railway.app",path="/api/naver-archive/posts",body="{}",token="synthetic",client=UUID.randomUUID().toString();var user=new JwtAuthenticationToken(Jwt.withTokenValue(token).header("alg","ES256").subject(ID).claim("client_id",client).build());var claims=new HashMap<String,Object>();claims.put("purpose","orbit-diary-v1");claims.put("scope","orbit:write:diary");claims.put("upstream_client",client);claims.put("upstream_hash",OrbitMoneyProofFilter.digest(token));claims.put("request_hash",OrbitMoneyProofFilter.digest("POST\n"+path+"\n"+body));claims.put("orbit_grant","test");claims.put("client_id","downstream");java.util.function.Supplier<Jwt> proof=()->Jwt.withTokenValue("proof").header("alg","ES256").issuer(issuer).audience(List.of(audience)).subject(ID).issuedAt(Instant.now().minusSeconds(1)).expiresAt(Instant.now().plusSeconds(20)).claims(c->c.putAll(claims)).build();var filter=new OrbitMoneyProofFilter(v->proof.get(),issuer,audience);assertThat(filter.valid(user,"POST",path,null,body,"proof")).isTrue();assertThat(filter.valid(user,"POST",path,null,"different","proof")).isFalse();claims.put("scope","orbit:write:money");assertThat(filter.valid(user,"POST",path,null,body,"proof")).isFalse();claims.put("scope","orbit:write:diary");claims.put("purpose","orbit-money-v1");assertThat(filter.valid(user,"POST",path,null,body,"proof")).isFalse();}
 @Test void delegatedRoutesExcludeImagesProgressDeleteAndOtherFeatures(){assertThat(ArchiveRoutes.allowed("GET","/api/naver-archive/posts/"+ID)).isTrue();for(String p:List.of("/api/naver-archive/assets/"+ID,"/api/naver-archive/posts/"+ID+"/read-progress","/api/log/state"))assertThat(ArchiveRoutes.allowed("GET",p)).isFalse();assertThat(ArchiveRoutes.allowed("DELETE","/api/naver-archive/posts/"+ID)).isFalse();}
}
