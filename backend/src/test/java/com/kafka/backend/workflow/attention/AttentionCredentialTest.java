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
        String persistent=Files.readString(Path.of("src/main/resources/db/migration/V115__attention_persistent_credentials.sql")).replaceAll("(?m)--.*$","").replace("TIMESTAMPTZ","TIMESTAMP WITH TIME ZONE");
        for(String part:persistent.split(";"))if(!part.isBlank()&&!part.contains("ENABLE ROW LEVEL SECURITY"))db.execute(part);
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
    @Test void boundedAuthorizationIssuanceAndProducerNamespaceAreEnforced(){
        for(int n=0;n<5;n++)service.authorize(request(UUID.randomUUID()));
        assertThatThrownBy(()->service.authorize(request(UUID.randomUUID()))).isInstanceOf(ResponseStatusException.class).satisfies(e->assertThat(((ResponseStatusException)e).getStatusCode().value()).isEqualTo(429));
        assertThatThrownBy(()->service.producer(new AttentionCredentials.Producer("Agent","../../other"))).isInstanceOf(ResponseStatusException.class);
        var token=service.producer(new AttentionCredentials.Producer("Codex","codex-local"));
        var principal=service.authenticate(token.token());assertThat(principal.producer()).isTrue();assertThat(principal.namespace()).isEqualTo("codex-local");assertThat(principal.ownerId()).isEqualTo(owner);
    }
    @Test void persistentGrantSurvivesTimeAndServiceRestartWithCompatibleWireDate(){
        var key=service.producer(new AttentionCredentials.Producer("Codex","codex-local"));
        assertThat(key.persistent()).isTrue();assertThat(key.expiresAt().toString()).isEqualTo("9999-12-31T23:59:59Z");
        assertThat(db.queryForObject("select expires_at from attention_credentials where id=?",java.sql.Timestamp.class,key.credentialId())).isNull();
        assertThat(service.devices().getFirst().expiresAt()).isEqualTo(key.expiresAt());assertThat(service.devices().getFirst().persistent()).isTrue();
        for(int days:List.of(31,60,365)){
            var restarted=new AttentionCredentials(db,()->owner,java.time.Clock.fixed(java.time.Instant.now().plusSeconds(days*86400L),java.time.ZoneOffset.UTC));
            assertThat(restarted.authenticate(key.token()).ownerId()).isEqualTo(owner);
        }
        var last=service.devices().getFirst().lastUsedAt();assertThat(last).isNotNull();service.authenticate(key.token());assertThat(service.devices().getFirst().lastUsedAt()).isEqualTo(last);
    }
    @Test void legacyExpiryBoundaryStillDeniesUntilOwnerRestore(){
        var key=service.producer(new AttentionCredentials.Producer("Legacy","codex-local"));var boundary=java.time.Instant.parse("2030-01-01T00:00:00Z");
        db.update("update attention_credentials set expires_at=? where id=?",java.sql.Timestamp.from(boundary),key.credentialId());
        assertThat(new AttentionCredentials(db,()->owner,java.time.Clock.fixed(boundary.minusSeconds(1),java.time.ZoneOffset.UTC)).authenticate(key.token()).ownerId()).isEqualTo(owner);
        assertThatThrownBy(()->new AttentionCredentials(db,()->owner,java.time.Clock.fixed(boundary,java.time.ZoneOffset.UTC)).authenticate(key.token())).isInstanceOf(ResponseStatusException.class);
    }
    @Test void legacyRestoreIsOwnerScopedIdempotentAuditedAndCannotReviveRevokedKeys(){
        var key=service.producer(new AttentionCredentials.Producer("Codex","codex-local"));
        db.update("update attention_credentials set expires_at=dateadd('DAY',-1,current_timestamp) where id=?",key.credentialId());
        assertThatThrownBy(()->service.authenticate(key.token())).isInstanceOf(ResponseStatusException.class);
        var other=new AttentionCredentials(db,()->UUID.randomUUID());
        assertThatThrownBy(()->other.restore(key.credentialId())).isInstanceOf(ResponseStatusException.class);
        service.restore(key.credentialId());service.restore(key.credentialId());
        assertThat(service.authenticate(key.token()).ownerId()).isEqualTo(owner);
        assertThat(db.queryForObject("select count(*) from attention_credential_events",Integer.class)).isEqualTo(1);
        var independent=service.producer(new AttentionCredentials.Producer("Other","team-kafka"));
        service.revoke(key.credentialId());var revoked=service.devices().stream().filter(d->d.id().equals(key.credentialId())).findFirst().orElseThrow().revokedAt();
        service.revoke(key.credentialId());assertThatThrownBy(()->service.restore(key.credentialId())).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->service.authenticate(key.token())).isInstanceOf(ResponseStatusException.class);
        assertThat(service.authenticate(independent.token()).ownerId()).isEqualTo(owner);
        assertThat(service.devices().stream().filter(d->d.id().equals(key.credentialId())).findFirst().orElseThrow().revokedAt()).isEqualTo(revoked);
    }
    @Test void expiredWindowsCredentialRequiresFreshPairingBecauseInstalledClientChecksStoredExpiry(){
        UUID install=UUID.randomUUID();var code=service.authorize(request(install));var key=service.exchange(new AttentionCredentials.Exchange(code.code(),verifier,state,install));
        db.update("update attention_credentials set expires_at=dateadd('DAY',-1,current_timestamp) where id=?",key.credentialId());
        assertThatThrownBy(()->service.restore(key.credentialId())).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->service.authenticate(key.token())).isInstanceOf(ResponseStatusException.class);
    }
}
