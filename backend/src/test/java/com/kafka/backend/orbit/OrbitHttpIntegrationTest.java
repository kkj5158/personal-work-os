package com.kafka.backend.orbit;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.*;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import tools.jackson.databind.ObjectMapper;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.*;

/** Real HTTP + ES256 verification + migrated owned PostgreSQL, never a shared DEV/PROD database. */
@EnabledIfEnvironmentVariable(named="ORBIT_OWNED_DB_TEST",matches="true")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=${ORBIT_TEST_DB_URL}","spring.datasource.username=orbit_synthetic","spring.datasource.password=",
    "spring.datasource.hikari.maximum-pool-size=2","spring.datasource.hikari.minimum-idle=0",
    "app.supabase.issuer=https://orbit.example.invalid/auth/v1","app.cors.allowed-origins=http://localhost:3000",
    "app.workflow-production.owner-id=00000000-0000-0000-0000-000000000001","app.auth-mirror.enabled=false",
    "app.money.processing-enabled=false","app.money.classification-enabled=false","app.absence-backfill-cron=-"})
@ActiveProfiles("prod")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OrbitHttpIntegrationTest {
    static final String ISSUER="https://orbit.example.invalid/auth/v1";
    static ECKey key;static HttpServer jwks;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry)throws Exception {
        key=new ECKeyGenerator(Curve.P_256).keyID("owned-test").generate();
        jwks=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        byte[] data=new JWKSet(key.toPublicJWK()).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
        jwks.createContext("/jwks",e->{e.sendResponseHeaders(200,data.length);e.getResponseBody().write(data);e.close();});jwks.start();
        registry.add("app.supabase.jwks-uri",()->"http://127.0.0.1:"+jwks.getAddress().getPort()+"/jwks");
    }
    @LocalServerPort int port;
    @Autowired JdbcTemplate db;@Autowired ObjectMapper json;
    final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    final UUID owner=UUID.randomUUID(), other=UUID.randomUUID(), empty=UUID.randomUUID();
    final Map<String,Long> before=new LinkedHashMap<>();
    static final List<String> ROUTES=List.of("get_sleep_context","get_recovery_context","get_diet_context","get_diet_daily_context","get_diet_progress_context","get_calendar_context","get_work_records_context","get_checklist_catalog_context","get_checklist_records_context","get_workflow_projects_context","get_workflow_tasks_context","get_workflow_day_context","get_workflow_plan_context","get_workflow_waiting_context","get_money_overview_context","get_money_transactions_context","get_money_accounts_context","get_money_loans_context","get_money_savings_context","get_money_earnings_context");
    static Stream<String> routes(){return ROUTES.stream();}
    @BeforeAll void fixtures(){
        for(UUID id:List.of(owner,other,empty))db.update("insert into auth.users(id) values(?)",id);
        LocalDate today=LocalDate.now(ZoneId.of("Asia/Seoul"));
        for(UUID id:List.of(owner,other)){
            String label=id.equals(owner)?"ORBIT_OWNER_A":"ORBIT_OWNER_B";
            db.update("insert into projects(id,user_id,name) values(?,?,?)",UUID.randomUUID(),id,label);
            db.update("insert into work_tasks(id,user_id,title,status,waiting_check_date) values(?,?,?,'WAITING',?)",UUID.randomUUID(),id,label,today);
            db.update("insert into diet_measurements(owner_id,metric,entry_date,measured_at,value,unit,slot) values(?,'weight',?,?,?,'kg','MORNING')",id,today,today.atStartOfDay(ZoneId.of("Asia/Seoul")).toOffsetDateTime(),id.equals(owner)?71.25:98.75);
            db.update("insert into money_accounts(id,user_id,provider,display_name,role,masked_reference,suffix,memo,image_data) values(?,?,'TEST',?,'SPENDING','PRIVATE_ACCOUNT','1234','PRIVATE_MEMO','PRIVATE_IMAGE')",UUID.randomUUID(),id,label);
            UUID account=db.queryForObject("select id from money_accounts where user_id=?",UUID.class,id);
            UUID expense=UUID.randomUUID();
            db.update("insert into money_transactions(id,user_id,type,from_account_id,amount,occurred_at,title,memo) values(?,?,'EXPENSE',?,10000,now(),'synthetic expense','PRIVATE_MEMO')",expense,id,account);
            db.update("insert into money_transactions(id,user_id,type,to_account_id,amount,occurred_at,title,refund_of) values(?,?,'REFUND',?,2000,now(),'synthetic refund',?)",UUID.randomUUID(),id,account,expense);
            db.update("insert into money_transactions(id,user_id,type,to_account_id,amount,occurred_at,title) values(?,?,'INCOME',?,20000,now(),'synthetic income')",UUID.randomUUID(),id,account);
        }
        for(String t:List.of("projects","work_tasks","diet_measurements","money_accounts","workpad_days","sleep_sessions","money_transactions"))before.put(t,db.queryForObject("select count(*) from "+t,Long.class));
    }
    @AfterAll void unchanged(){
        try{before.forEach((t,count)->assertThat(db.queryForObject("select count(*) from "+t,Long.class)).as("read-only "+t).isEqualTo(count));}
        finally{if(jwks!=null)jwks.stop(0);}
    }
    String token(UUID id,Instant expiry,String issuer,String audience)throws Exception{
        var claims=new JWTClaimsSet.Builder().subject(id.toString()).issuer(issuer).audience(audience).issueTime(Date.from(Instant.now().minusSeconds(600))).expirationTime(Date.from(expiry)).build();
        var jwt=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(key.getKeyID()).build(),claims);jwt.sign(new ECDSASigner(key));return jwt.serialize();
    }
    HttpResponse<String> request(String route,String token,String method)throws Exception{
        var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/orbit/context/"+route)).timeout(Duration.ofSeconds(20));
        if(token!=null)b.header("Authorization","Bearer "+token);
        return http.send(b.method(method,HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());
    }
    HttpResponse<String> get(String route,UUID user)throws Exception{return request(route,token(user,Instant.now().plusSeconds(300),ISSUER,"authenticated"),"GET");}
    @ParameterizedTest @MethodSource("routes") void anonymousIsRejected(String route)throws Exception{
        var r=request(route,null,"GET");assertThat(r.statusCode()).isEqualTo(401);assertThat(r.headers().firstValue("Cache-Control")).hasValue("private, no-store");
    }
    @ParameterizedTest @MethodSource("routes") void realJwtReturnsStablePrivateJsonAndIsolatesOwner(String route)throws Exception{
        // Each test has its own synthetic principal: per-instance quotas are tested separately.
        var r=get(route,owner);assertThat(r.statusCode()).as(route).isEqualTo(200);
        assertThat(r.headers().firstValue("Cache-Control")).hasValue("private, no-store");
        assertThat(json.readTree(r.body()).has("schemaVersion")).isTrue();
        assertThat(r.body()).doesNotContain("ORBIT_OWNER_B","98.75","PRIVATE_ACCOUNT","PRIVATE_MEMO","PRIVATE_IMAGE","maskedReference","imageData");
    }
    @ParameterizedTest @MethodSource("routes") void differentEmptyOwnerCannotSeeFirstOwnersFacts(String route)throws Exception{
        var r=get(route,empty);assertThat(r.statusCode()).as(route).isEqualTo(200);
        assertThat(r.body()).doesNotContain("ORBIT_OWNER_A","ORBIT_OWNER_B","71.25","98.75");
    }
    @ParameterizedTest @MethodSource("routes") void malformedTokenIsRejected(String route)throws Exception{assertThat(request(route,"not-a-jwt","GET").statusCode()).isEqualTo(401);}
    @Test void signedExpiredWrongAudienceAndWrongIssuerAreRejected()throws Exception{
        for(var args:List.of(List.of(Instant.now().minusSeconds(120),ISSUER,"authenticated"),List.of(Instant.now().plusSeconds(300),"https://wrong.invalid","authenticated"),List.of(Instant.now().plusSeconds(300),ISSUER,"wrong")))
            assertThat(request("get_diet_context",token(owner,(Instant)args.get(0),(String)args.get(1),(String)args.get(2)),"GET").statusCode()).isEqualTo(401);
    }
    @Test void datePageUnknownAndDuplicateArgumentsFailAsJson()throws Exception{
        for(String route:List.of("get_diet_context?from=bad&to=bad","get_calendar_context?from=2026-01-01&to=2026-04-01","get_workflow_tasks_context?limit=101","get_workflow_tasks_context?limit=abc","get_workflow_tasks_context?offset=10001","get_workflow_tasks_context?userId="+other,"get_workflow_tasks_context?limit=1&limit=2","get_sleep_context?timezone=UTC")){
            var r=get(route,other);assertThat(r.statusCode()).as(route).isEqualTo(400);assertThat(json.readTree(r.body()).has("message")).isTrue();
        }
    }
    @Test void writesAreNotMappedAndPagesAreDeterministic()throws Exception{
        for(String method:List.of("POST","PUT","PATCH","DELETE"))assertThat(request("get_diet_context",token(other,Instant.now().plusSeconds(300),ISSUER,"authenticated"),method).statusCode()).isEqualTo(405);
        var a=json.readTree(get("get_workflow_projects_context?limit=1",other).body());
        var b=json.readTree(get("get_workflow_projects_context?limit=1",other).body());
        assertThat(a.get("data")).isEqualTo(b.get("data"));assertThat(a.get("total").asInt()).isEqualTo(1);
    }
    @Test void financialProjectionMatchesCanonicalOverviewIncludingRefundSemantics()throws Exception{
        String today=LocalDate.now(ZoneId.of("Asia/Seoul")).toString();
        var orbit=json.readTree(get("get_money_overview_context?from="+today+"&to="+today,other).body()).get("data");
        var canonical=http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/money/overview?from="+today+"&to="+today)).header("Authorization","Bearer "+token(other,Instant.now().plusSeconds(300),ISSUER,"authenticated")).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(canonical.statusCode()).isEqualTo(200);
        assertThat(orbit.get("kpis")).isEqualTo(json.readTree(canonical.body()).get("kpis"));
        assertThat(orbit.get("kpis").get("consumption").asInt()).isEqualTo(8000);
        assertThat(orbit.get("kpis").get("income").asInt()).isEqualTo(20000);
    }
    @Test void missingMeasurementsStayUnknownAndSeoulMidnightAttributionIsPreserved()throws Exception{
        var missing=json.readTree(get("get_diet_context",empty).body());
        assertThat(missing.get("metrics").get("weight").get("average").isNull()).isTrue();
        var actual=json.readTree(get("get_diet_context",other).body());
        assertThat(actual.get("readings").get(0).get("measuredAt").asText()).endsWith("T00:00:00");
        assertThat(actual.get("metrics").get("weight").get("average").asDouble()).isEqualTo(98.75);
    }
}
