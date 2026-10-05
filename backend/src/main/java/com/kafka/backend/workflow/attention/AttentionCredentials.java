package com.kafka.backend.workflow.attention;

import com.kafka.backend.common.CurrentUserProvider;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Existing POS browser identity authorizes a bounded S256 native-device exchange. */
@Service
public class AttentionCredentials {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final SecureRandom random=new SecureRandom();
    public AttentionCredentials(JdbcTemplate db,CurrentUserProvider users){this.db=db;this.users=users;}
    public record Authorize(String challenge,String state,String redirectUri,UUID installId,String deviceName) {}
    public record Authorization(String code,String state,String redirectUri,Instant expiresAt){@Override public String toString(){return "Authorization[REDACTED]";}}
    public record Exchange(String code,String verifier,String state,UUID installId){@Override public String toString(){return "Exchange[REDACTED]";}}
    public record Credential(String token,UUID ownerId,UUID credentialId,Instant expiresAt){@Override public String toString(){return "Credential[REDACTED]";}}
    public record Device(UUID id,String kind,String name,String namespace,Instant expiresAt,Instant revokedAt){}
    public record Producer(String name,String namespace){}
    static String hash(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    static String challenge(String verifier){try{return Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    static void validate(Authorize in){
        if(in==null||in.installId()==null||in.challenge()==null||!in.challenge().matches("[A-Za-z0-9_-]{43}")||in.state()==null||!in.state().matches("[A-Za-z0-9_-]{32,128}")||in.deviceName()==null||in.deviceName().isBlank()||in.deviceName().length()>60)throw invalid();
        try{var uri=URI.create(in.redirectUri()); if(!"http".equals(uri.getScheme())||!"127.0.0.1".equals(uri.getHost())||uri.getPort()<1024||uri.getPort()>65535||!"/callback".equals(uri.getPath())||uri.getQuery()!=null||uri.getFragment()!=null||uri.getUserInfo()!=null)throw invalid();}catch(IllegalArgumentException e){throw invalid();}
    }
    private static ResponseStatusException invalid(){return new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid native authorization");}
    private static ResponseStatusException denied(){return new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Credential invalid, expired or revoked");}
    private String secret(String prefix){byte[] bytes=new byte[32];random.nextBytes(bytes);return prefix+Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);}
    @Transactional public Authorization authorize(Authorize in){
        validate(in);UUID owner=users.getCurrentUserId();
        if(db.queryForObject("select count(*) from attention_device_authorizations where user_id=? and created_at> ?",Integer.class,owner,Timestamp.from(Instant.now().minusSeconds(60)))>=5)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Try again shortly");
        String code=secret("aqc_");Instant expires=Instant.now().plusSeconds(120);
        db.update("insert into attention_device_authorizations(code_hash,user_id,challenge,state_hash,install_id,device_name,expires_at) values(?,?,?,?,?,?,?)",hash(code),owner,in.challenge(),hash(in.state()),in.installId(),in.deviceName().strip(),Timestamp.from(expires));
        return new Authorization(code,in.state(),in.redirectUri(),expires);
    }
    @Transactional public Credential exchange(Exchange in){
        if(in==null||in.code()==null||!in.code().matches("aqc_[A-Za-z0-9_-]{43}")||in.verifier()==null||!in.verifier().matches("[A-Za-z0-9._~-]{43,128}")||in.state()==null||in.state().length()>128||in.installId()==null)throw denied();
        var rows=db.queryForList("select * from attention_device_authorizations where code_hash=? and consumed_at is null and expires_at>current_timestamp for update",hash(in.code()));
        if(rows.size()!=1)throw denied();var row=rows.getFirst();
        if(!row.get("install_id").equals(in.installId())||!MessageDigest.isEqual(row.get("challenge").toString().getBytes(StandardCharsets.US_ASCII),challenge(in.verifier()).getBytes(StandardCharsets.US_ASCII))||!MessageDigest.isEqual(row.get("state_hash").toString().getBytes(StandardCharsets.US_ASCII),hash(in.state()).getBytes(StandardCharsets.US_ASCII)))throw denied();
        db.update("update attention_device_authorizations set consumed_at=current_timestamp where code_hash=?",hash(in.code()));
        UUID owner=(UUID)row.get("user_id");
        // Re-pairing the same installation revokes its previous credential; no refresh secret reaches the web renderer.
        db.update("update attention_credentials set revoked_at=current_timestamp where user_id=? and install_id=? and kind='DEVICE' and revoked_at is null",owner,in.installId());
        return issue(owner,in.installId(),"DEVICE",row.get("device_name").toString(),"human");
    }
    private Credential issue(UUID owner,UUID install,String kind,String name,String namespace){
        String token=secret(kind.equals("PRODUCER")?"aqp_":"aqd_");UUID id=UUID.randomUUID();Instant expires=Instant.now().plus(30,ChronoUnit.DAYS);
        db.update("insert into attention_credentials(id,user_id,install_id,kind,device_name,namespace,token_hash,expires_at) values(?,?,?,?,?,?,?,?)",id,owner,install,kind,name,namespace,hash(token),Timestamp.from(expires));
        return new Credential(token,owner,id,expires);
    }
    @Transactional public Credential producer(Producer in){
        if(in==null||in.name()==null||in.name().isBlank()||in.name().length()>60||in.namespace()==null||!in.namespace().matches("[a-z][a-z0-9-]{2,47}"))throw invalid();
        return issue(users.getCurrentUserId(),null,"PRODUCER",in.name().strip(),in.namespace());
    }
    public AttentionAuthentication authenticate(String token){
        if(token==null||!token.matches("aq[dp]_[A-Za-z0-9_-]{43}"))throw denied();
        var rows=db.query("select id,user_id,kind,namespace from attention_credentials where token_hash=? and revoked_at is null and expires_at>current_timestamp",(r,n)->new AttentionAuthentication(r.getObject("user_id",UUID.class),r.getObject("id",UUID.class),r.getString("namespace"),r.getString("kind")),hash(token));
        if(rows.size()!=1)throw denied();return rows.getFirst();
    }
    public List<Device> devices(){return db.query("select * from attention_credentials where user_id=? order by created_at desc",(r,n)->new Device(r.getObject("id",UUID.class),r.getString("kind"),r.getString("device_name"),r.getString("namespace"),r.getTimestamp("expires_at").toInstant(),r.getTimestamp("revoked_at")==null?null:r.getTimestamp("revoked_at").toInstant()),users.getCurrentUserId());}
    public void revoke(UUID id){if(db.update("update attention_credentials set revoked_at=current_timestamp where id=? and user_id=?",id,users.getCurrentUserId())!=1)throw new ResponseStatusException(HttpStatus.NOT_FOUND);}
}
