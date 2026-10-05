package com.kafka.backend.workflow.attention;

import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class AttentionCredentialTest {
    private JdbcTemplate db;private AttentionCredentials service;private UUID owner;private SingleConnectionDataSource source;
    private final String verifier="a".repeat(43),state="s".repeat(43);
    @BeforeEach void setup()throws Exception{
        source=new SingleConnectionDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL","sa","",true);db=new JdbcTemplate(source);owner=UUID.randomUUID();
        db.execute("create schema auth");db.execute("create table auth.users(id uuid primary key)");db.update("insert into auth.users(id) values(?)",owner);
        String sql=Files.readString(Path.of("src/main/resources/db/migration/V72__workflow_attention_queue.sql")).replaceAll("(?m)--.*$","").replace("TIMESTAMPTZ","TIMESTAMP WITH TIME ZONE");
        for(String part:sql.split(";"))if(!part.isBlank()&&!part.contains("ENABLE ROW LEVEL SECURITY"))db.execute(part);
        service=new AttentionCredentials(db,()->owner);
    }
    @AfterEach void close(){source.destroy();}
    private AttentionCredentials.Authorize request(UUID install){return new AttentionCredentials.Authorize(AttentionCredentials.challenge(verifier),state,"http://127.0.0.1:49152/callback",install,"WORK QUEUE Windows");}
    @Test void s256ExchangeIsSingleUseBoundToInstallAndStateAndSecretStoredOnlyAsHash(){
        UUID install=UUID.randomUUID();var authorization=service.authorize(request(install));
        assertThatThrownBy(()->service.exchange(new AttentionCredentials.Exchange(authorization.code(),"b".repeat(43),state,install))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->service.exchange(new AttentionCredentials.Exchange(authorization.code(),verifier,"x".repeat(43),install))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->service.exchange(new AttentionCredentials.Exchange(authorization.code(),verifier,state,UUID.randomUUID()))).isInstanceOf(ResponseStatusException.class);
        var credential=service.exchange(new AttentionCredentials.Exchange(authorization.code(),verifier,state,install));
        assertThat(credential.ownerId()).isEqualTo(owner);assertThat(service.authenticate(credential.token()).ownerId()).isEqualTo(owner);
        assertThat(db.queryForObject("select token_hash from attention_credentials",String.class)).isEqualTo(AttentionCredentials.hash(credential.token())).doesNotContain(credential.token());
        assertThat(credential.toString()).doesNotContain(credential.token());assertThat(authorization.toString()).doesNotContain(authorization.code());
        assertThatThrownBy(()->service.exchange(new AttentionCredentials.Exchange(authorization.code(),verifier,state,install))).isInstanceOf(ResponseStatusException.class);
        service.revoke(credential.credentialId());assertThatThrownBy(()->service.authenticate(credential.token())).isInstanceOf(ResponseStatusException.class);
    }
    @Test void strictLoopbackRejectsOpenRedirectAndUnsafeOrigins(){
        for(String uri:List.of("https://evil.example/callback","http://localhost:49152/callback","http://127.0.0.1:80/callback","http://127.0.0.1:49152/callback?next=evil","http://user@127.0.0.1:49152/callback","http://127.0.0.1:49152/callback#token")){
            var in=request(UUID.randomUUID());assertThatThrownBy(()->AttentionCredentials.validate(new AttentionCredentials.Authorize(in.challenge(),in.state(),uri,in.installId(),in.deviceName()))).isInstanceOf(ResponseStatusException.class);
        }
    }
    @Test void expiryOwnerIsolationAndRePairRevocation(){
        UUID install=UUID.randomUUID();var a=service.authorize(request(install));db.update("update attention_device_authorizations set expires_at=dateadd('SECOND',-1,current_timestamp)");
        assertThatThrownBy(()->service.exchange(new AttentionCredentials.Exchange(a.code(),verifier,state,install))).isInstanceOf(ResponseStatusException.class);
        var b=service.authorize(request(install));var first=service.exchange(new AttentionCredentials.Exchange(b.code(),verifier,state,install));
        var c=service.authorize(request(install));var second=service.exchange(new AttentionCredentials.Exchange(c.code(),verifier,state,install));
        assertThatThrownBy(()->service.authenticate(first.token())).isInstanceOf(ResponseStatusException.class);assertThat(service.authenticate(second.token()).producer()).isFalse();
        var other=new AttentionCredentials(db,()->UUID.randomUUID());assertThat(other.devices()).isEmpty();assertThatThrownBy(()->other.revoke(second.credentialId())).isInstanceOf(ResponseStatusException.class);
    }
}
