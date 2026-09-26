package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
class MoneyBridgePostgresTest {
    interface Check{void run(MoneyBridgeService b,JdbcTemplate db);}
    void rollback(Check check)throws Exception{try(var c=MoneyPostgresIntegrationTest.connection()){c.setAutoCommit(false);try{var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));check.run(new MoneyBridgeService(db,()->MoneyPostgresIntegrationTest.OWNER),db);}finally{SecurityContextHolder.clearContext();c.rollback();}}}
    @Test void enrollmentIsSingleUseHashedExpiringAndRotationRevokesOldCredential()throws Exception{rollback((b,db)->{
        var code=b.enroll();UUID install=UUID.randomUUID();var credential=b.exchange(code.code(),install);
        assertThat(b.authenticate(credential.token()).ownerId()).isEqualTo(MoneyPostgresIntegrationTest.OWNER);
        assertThatThrownBy(()->b.exchange(code.code(),install)).isInstanceOf(ResponseStatusException.class);
        assertThat(credential.toString()).doesNotContain(credential.token());
        assertThat(db.queryForObject("select token_hash from money_bridge_devices where install_id=?",String.class,install)).isEqualTo(MoneyBridgeService.hash(credential.token()));
        var rotated=b.exchange(b.enroll().code(),install);assertThatThrownBy(()->b.authenticate(credential.token())).isInstanceOf(ResponseStatusException.class);
        assertThat(b.authenticate(rotated.token()).installId()).isEqualTo(install);
        db.update("update money_bridge_devices set expires_at=now()-interval '1 second' where install_id=?",install);
        assertThatThrownBy(()->b.authenticate(rotated.token())).isInstanceOf(ResponseStatusException.class);
        var expired=b.enroll();db.update("update money_bridge_enrollments set expires_at=now()-interval '1 second' where code_hash=?",MoneyBridgeService.hash(expired.code()));
        assertThatThrownBy(()->b.exchange(expired.code(),install)).isInstanceOf(ResponseStatusException.class);
    });}
    @Test void ownerIsolationRevocationAndCanonicalIdempotency()throws Exception{rollback((b,db)->{
        var c=b.exchange(b.enroll().code(),UUID.randomUUID());var auth=b.authenticate(c.token());
        var stranger=new MoneyBridgeService(db,UUID::randomUUID);
        assertThat(stranger.devices()).isEmpty();assertThatThrownBy(()->stranger.revoke(auth.deviceId())).isInstanceOf(ResponseStatusException.class);
        SecurityContextHolder.getContext().setAuthentication(auth);
        var money=MoneyPostgresIntegrationTest.service(db,auth.ownerId());
        Map<String,Object> body=new HashMap<>(Map.of("deviceId",auth.installId().toString(),"idempotencyKey","money-bridge:"+UUID.randomUUID(),"sourcePackage","com.kakaobank.channel","postedAt","2026-09-26T00:00:00Z","text","SYNTHETIC BRIDGE DIAGNOSTIC — not a financial transaction"));
        var first=money.ingest(body);assertThat(first.created()).isTrue();var second=money.ingest(body);assertThat(second.created()).isFalse();assertThat(second.notification().id()).isEqualTo(first.notification().id());
        b.receipt(auth,201);b.receipt(auth,200);assertThat(b.devices().stream().filter(d->d.id().equals(auth.deviceId())).findFirst().orElseThrow().duplicateCount()).isEqualTo(1);
        body.put("deviceId",UUID.randomUUID().toString());assertThatThrownBy(()->money.ingest(body)).isInstanceOf(InvalidRequestException.class);
        body.put("deviceId",auth.installId().toString());body.put("sourcePackage","com.example.unlisted");assertThatThrownBy(()->money.ingest(body)).isInstanceOf(InvalidRequestException.class);
        b.revoke(auth.deviceId());assertThatThrownBy(()->b.authenticate(c.token())).isInstanceOf(ResponseStatusException.class);
    });}
}
