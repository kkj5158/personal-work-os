package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class MoneyBridgeService {
    public static final Set<String> BANK_PACKAGES=Set.of("com.shinhan.sbanking","com.ibk.android.ionebank","com.wooribank.smart.npib","com.kakaobank.channel");
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final SecureRandom random=new SecureRandom();
    public MoneyBridgeService(JdbcTemplate db,CurrentUserProvider users){this.db=db;this.users=users;}
    public record Enrollment(String code, Instant expiresAt) { @Override public String toString(){return "Enrollment[REDACTED]";} }
    public record Credential(String token, UUID ownerId, UUID installId, Instant expiresAt) { @Override public String toString(){return "Credential[REDACTED]";} }
    public record Device(UUID id, UUID installId, Instant expiresAt, Instant revokedAt, Instant lastReceivedAt,
                         String lastStatus,long acceptedCount,long duplicateCount,long rejectedCount) {}
    private String secret(String prefix){byte[] b=new byte[32];random.nextBytes(b);return prefix+Base64.getUrlEncoder().withoutPadding().encodeToString(b);}
    static String hash(String s){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private static Instant instant(java.sql.ResultSet r,String name)throws java.sql.SQLException{var v=r.getTimestamp(name);return v==null?null:v.toInstant();}
    private static ResponseStatusException unauthorized(){return new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Bridge credential invalid, expired or revoked");}
    @Transactional public Enrollment enroll(){
        UUID owner=users.getCurrentUserId();
        // One pending enrollment per owner; generating another invalidates the prior code.
        db.update("delete from money_bridge_enrollments where user_id=? or expires_at<now()",owner);
        String code=secret("me1_");Instant expires=Instant.now().plus(5,ChronoUnit.MINUTES);
        db.update("insert into money_bridge_enrollments(code_hash,user_id,expires_at) values(?,?,?)",hash(code),owner,Timestamp.from(expires));
        return new Enrollment(code,expires);
    }
    @Transactional public Credential exchange(String code,UUID install){
        if(code==null||!code.matches("me1_[A-Za-z0-9_-]{43}")||install==null)throw unauthorized();
        var owners=db.query("delete from money_bridge_enrollments where code_hash=? and expires_at>now() returning user_id",(r,n)->r.getObject(1,UUID.class),hash(code));
        if(owners.size()!=1)throw unauthorized();
        UUID owner=owners.getFirst();String token=secret("mb1_");Instant expires=Instant.now().plus(30,ChronoUnit.DAYS);
        db.update("""
            insert into money_bridge_devices(id,user_id,install_id,token_hash,expires_at) values(?,?,?,?,?)
            on conflict(user_id,install_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,revoked_at=null
            """,UUID.randomUUID(),owner,install,hash(token),Timestamp.from(expires));
        return new Credential(token,owner,install,expires);
    }
    public BridgeAuthentication authenticate(String token){
        if(token==null||!token.matches("mb1_[A-Za-z0-9_-]{43}"))throw unauthorized();
        var rows=db.query("select id,user_id,install_id from money_bridge_devices where token_hash=? and revoked_at is null and expires_at>now()",
            (r,n)->new BridgeAuthentication(r.getObject("user_id",UUID.class),r.getObject("id",UUID.class),r.getObject("install_id",UUID.class)),hash(token));
        if(rows.size()!=1)throw unauthorized();return rows.getFirst();
    }
    public List<Device> devices(){return db.query("select * from money_bridge_devices where user_id=? order by created_at desc",(r,n)->new Device(r.getObject("id",UUID.class),r.getObject("install_id",UUID.class),instant(r,"expires_at"),instant(r,"revoked_at"),instant(r,"last_received_at"),r.getString("last_status"),r.getLong("accepted_count"),r.getLong("duplicate_count"),r.getLong("rejected_count")),users.getCurrentUserId());}
    public void revoke(UUID id){if(db.update("update money_bridge_devices set revoked_at=now() where id=? and user_id=?",id,users.getCurrentUserId())!=1)throw new ResponseStatusException(HttpStatus.NOT_FOUND);}
    public void receipt(BridgeAuthentication auth,int status){
        String result=status==201?"ACCEPTED":status==200?"DUPLICATE":"REJECTED";
        db.update("update money_bridge_devices set last_received_at=now(),last_status=?,accepted_count=accepted_count+?,duplicate_count=duplicate_count+?,rejected_count=rejected_count+? where id=? and user_id=?",
            result,status==201?1:0,status==200?1:0,status>=400?1:0,auth.deviceId(),auth.ownerId());
    }
}
