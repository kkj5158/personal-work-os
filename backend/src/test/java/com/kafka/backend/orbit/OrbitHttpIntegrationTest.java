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
    "app.orbit.oauth-client-ids=00000000-0000-0000-0000-000000000099",
    "app.money.processing-enabled=false","app.money.classification-enabled=false","app.absence-backfill-cron=-"})
@ActiveProfiles("prod")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OrbitHttpIntegrationTest {
    static final String ISSUER="https://orbit.example.invalid/auth/v1";
    static ECKey key;static HttpServer jwks;
    @DynamicPropertySource static void properties(DynamicPropertyRegistry registry)throws Exception {
        if (!"jdbc:postgresql://127.0.0.1:55469/postgres".equals(System.getenv("ORBIT_TEST_DB_URL")))
            throw new IllegalStateException("Owned loopback ORBIT database required");
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
            UUID loan=UUID.randomUUID();
            db.update("insert into money_loans(id,user_id,name,lender,type,original_principal,remaining_principal) values(?,?,?,'TEST','PERSONAL',10000,9000)",loan,id,label);
            db.update("insert into money_transactions(id,user_id,type,from_account_id,loan_id,amount,principal,interest,fee,occurred_at,title) values(?,?,'LOAN_PAYMENT',?,?,1100,1000,100,0,now(),'synthetic repayment')",UUID.randomUUID(),id,account,loan);
        }
        for(String t:List.of("projects","work_tasks","diet_measurements","money_accounts","workpad_days","sleep_sessions","money_transactions"))before.put(t,db.queryForObject("select count(*) from "+t,Long.class));
    }
    @AfterAll void unchanged(){
        try{before.forEach((t,count)->assertThat(db.queryForObject("select count(*) from "+t,Long.class)).as("read-only "+t).isEqualTo(count));}
        finally{
            // Keep subsequent legacy suites' global-count assumptions intact.
            // These exact random owners were created above in the owned loopback cluster.
            db.update("delete from diet_measurements where owner_id in (?,?,?)",owner,other,empty);
            db.update("delete from money_classification_jobs where user_id in (?,?,?)",owner,other,empty);
            db.update("delete from auth.users where id in (?,?,?)",owner,other,empty);
            if(jwks!=null)jwks.stop(0);
        }
    }
    String token(UUID id,Instant expiry,String issuer,String audience)throws Exception{
        return token(id,expiry,issuer,audience,null);
    }
    String token(UUID id,Instant expiry,String issuer,String audience,String clientId)throws Exception{
        var builder=new JWTClaimsSet.Builder().subject(id.toString()).issuer(issuer).audience(audience).issueTime(Date.from(Instant.now().minusSeconds(600))).expirationTime(Date.from(expiry));
        if(clientId!=null)builder.claim("client_id",clientId);
        var claims=builder.build();
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
        assertThat(json.readTree(r.body()).get("message").asText()).isEqualTo("User authentication required");
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
    @ParameterizedTest @MethodSource("routes") void delegatedJwtCanReadOnlyThese20Routes(String route)throws Exception{
        var delegated=token(empty,Instant.now().plusSeconds(300),ISSUER,"authenticated","00000000-0000-0000-0000-000000000099");
        assertThat(request(route,delegated,"GET").statusCode()).as(route).isEqualTo(200);
    }
    @Test void delegatedJwtCannotWriteUseAnotherClientOrReadOtherPosApis()throws Exception{
        var delegated=token(owner,Instant.now().plusSeconds(300),ISSUER,"authenticated","00000000-0000-0000-0000-000000000099");
        for(String method:List.of("POST","PUT","PATCH","DELETE")){
            var r=request("get_diet_context",delegated,method);
            assertThat(r.statusCode()).isEqualTo(403);
            assertThat(json.readTree(r.body()).has("message")).isTrue();
        }
        var unknown=token(owner,Instant.now().plusSeconds(300),ISSUER,"authenticated",UUID.randomUUID().toString());
        assertThat(request("get_diet_context",unknown,"GET").statusCode()).isEqualTo(403);
        String today=LocalDate.now(ZoneId.of("Asia/Seoul")).toString();
        var canonical=http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/money/overview?from="+today+"&to="+today)).header("Authorization","Bearer "+delegated).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(canonical.statusCode()).isEqualTo(403);
    }
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
        var kpis=orbit.get("kpis");
        assertThat(kpis).isEqualTo(json.readTree(canonical.body()).get("kpis"));
        // Linked refunds reduce general consumption. The 100 KRW of loan interest belongs to loan repayment.
        assertThat(kpis.get("consumption").asInt()).isEqualTo(10000-2000);
        assertThat(kpis.get("income").asInt()).isEqualTo(20000);
        assertThat(kpis.get("loanPrincipal").asInt()).isEqualTo(1000);

        UUID account=db.queryForObject("select id from money_accounts where user_id=?",UUID.class,other);
        try {
            db.update("insert into money_tracking_settings(user_id) values(?)",other);
            db.update("insert into money_tracking_selections(user_id,kind,effective_at,version,accounts) values(?,'EXPENSE',?,0,?)",
                other,LocalDate.parse(today).atStartOfDay(ZoneId.of("Asia/Seoul")).toOffsetDateTime(),new UUID[]{account});
            var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/money/v4/summary?from="+today+"&to="+today+"&currency=KRW&accountIds="+account))
                .header("Authorization","Bearer "+token(other,Instant.now().plusSeconds(300),ISSUER,"authenticated")).build();
            var summary=http.send(request,HttpResponse.BodyHandlers.ofString());
            assertThat(summary.statusCode()).isEqualTo(200);
            var flows=json.readTree(summary.body());
            assertThat(flows.get("consumption").asInt()).isEqualTo(8000);
            assertThat(flows.get("loanRepayment").asInt()).isEqualTo(1100);
            assertThat(flows.get("totalExpense").asInt()).isEqualTo(9100);
        } finally {
            db.update("delete from money_tracking_selections where user_id=?",other);
            db.update("delete from money_tracking_settings where user_id=?",other);
        }
    }
    @Test void missingMeasurementsStayUnknownAndSeoulMidnightAttributionIsPreserved()throws Exception{
        var missing=json.readTree(get("get_diet_context",empty).body());
        assertThat(missing.get("metrics").get("weight").get("average").isNull()).isTrue();
        var actual=json.readTree(get("get_diet_context",other).body());
        assertThat(actual.get("readings").get(0).get("measuredAt").asText()).endsWith("T00:00:00");
        assertThat(actual.get("metrics").get("weight").get("average").asDouble()).isEqualTo(98.75);
    }
    @Test void loanHistoryAndTransactionSplitsMatchCanonicalFinancialReads()throws Exception{
        var context=json.readTree(get("get_money_loans_context",other).body());
        var loan=context.get("data").get(0);
        assertThat(loan.get("remainingPrincipal").asInt()).isEqualTo(9000);
        var repayment=context.get("repayments").get(0);
        assertThat(repayment.get("principal").asInt()).isEqualTo(1000);
        assertThat(repayment.get("interest").asInt()).isEqualTo(100);
        assertThat(repayment.get("remainingPrincipal").asInt()).isEqualTo(9000);
        String path="http://127.0.0.1:"+port+"/api/money/loans/"+loan.get("id").asText()+"/repayments";
        var canonical=http.send(HttpRequest.newBuilder(URI.create(path)).header("Authorization","Bearer "+token(other,Instant.now().plusSeconds(300),ISSUER,"authenticated")).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(canonical.statusCode()).isEqualTo(200);
        assertThat(repayment.get("remainingPrincipal")).isEqualTo(json.readTree(canonical.body()).get(0).get("remainingPrincipal"));
        var transactions=json.readTree(get("get_money_transactions_context",other).body()).get("data");
        boolean found=false;
        for(var transaction:transactions)if("LOAN_PAYMENT".equals(transaction.get("type").asText())){
            assertThat(transaction.get("loanId")).isEqualTo(loan.get("id"));
            assertThat(transaction.get("principal").asInt()).isEqualTo(1000);found=true;
        }
        assertThat(found).isTrue();
    }
    @Test void largeUnpagedSourcesFailBeforeMaterialization()throws Exception{
        UUID crowded=UUID.randomUUID();db.update("insert into auth.users(id) values(?)",crowded);
        try{
            db.update("insert into work_tasks(id,user_id,title) select gen_random_uuid(),?,'synthetic bounded task' from generate_series(1,10001)",crowded);
            var r=get("get_workflow_waiting_context",crowded);
            assertThat(r.statusCode()).isEqualTo(422);assertThat(json.readTree(r.body()).get("code").asText()).isEqualTo("CONTEXT_LIMIT");
        }finally{db.update("delete from auth.users where id=?",crowded);}
    }
    void cleanupMoneyConsole(UUID user){ for(String table:List.of("money_ai_events","money_command_outcomes","money_meaning_audit","money_classification_jobs","money_classification_state","money_classification_events","money_review_decisions","money_rule_projections","money_bookkeeping_overrides","money_transaction_sources","money_raw_notifications","money_transactions","money_accounts","money_categories"))db.update("delete from "+table+" where user_id=?",user);db.update("delete from auth.users where id=?",user); }
    HttpResponse<String> console(UUID user,String route,String method,Object body)throws Exception{
        var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/orbit/money/v1/"+route)).timeout(Duration.ofSeconds(30)).header("Authorization","Bearer "+token(user,Instant.now().plusSeconds(300),ISSUER,"authenticated"));
        return http.send(b.header("Content-Type","application/json").method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
    }
    @Test void moneyConsoleCategoryCasIdempotencyAndOwnerIsolationOverRealHttp()throws Exception{
        UUID user=UUID.randomUUID();db.update("insert into auth.users(id) values(?)",user);
        try{
            UUID request=UUID.randomUUID();var create=Map.of("requestId",request,"name","Console synthetic","kind","EXPENSE","color","#123456");
            var response=console(user,"create-category","POST",create);assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
            var receipt=json.readTree(response.body()).get("data");assertThat(receipt.get("status").asText()).isEqualTo("APPLIED");
            var category=receipt.get("result").get("persisted");String cid=category.get("id").asText();long version=category.get("version").asLong();
            assertThat(console(user,"create-category","POST",create).body()).contains(cid);
            assertThat(db.queryForObject("select count(*) from money_categories where user_id=?",Long.class,user)).isEqualTo(1);
            var different=new LinkedHashMap<String,Object>(create);different.put("name","different");assertThat(console(user,"create-category","POST",different).statusCode()).isBetween(400,499);
            var color=Map.of("requestId",UUID.randomUUID(),"categoryId",cid,"expectedVersion",version,"expectedColor","#123456","color","#abcdef");
            var changed=console(user,"category-color","POST",color);assertThat(changed.statusCode()).as(changed.body()).isEqualTo(200);assertThat(changed.body()).contains("#abcdef");
            assertThat(db.queryForObject("select version from money_categories where user_id=? and id=?::uuid",Long.class,user,cid)).isEqualTo(version);
            var conflict=new LinkedHashMap<String,Object>(color);conflict.put("requestId",UUID.randomUUID());assertThat(console(user,"category-color","POST",conflict).body()).contains("NOT_APPLIED");
            assertThat(console(other,"category-impact?id="+cid,"GET",null).statusCode()).isBetween(400,499);
            assertThat(console(user,"operation-outcome?requestId="+color.get("requestId"),"GET",null).body()).contains("#abcdef","APPLIED");
            for(String route:List.of("capabilities","dashboard","attention","review-items","processing-events","bookkeeping","categories","category-palette","rules","accounts","reconciliation","loans","savings","change-history")){
                var read=console(user,route,"GET",null);assertThat(read.statusCode()).as(route+" "+read.body()).isEqualTo(200);assertThat(read.headers().firstValue("Cache-Control")).hasValue("no-store");
            }
            var delegated=token(user,Instant.now().plusSeconds(300),ISSUER,"authenticated","00000000-0000-0000-0000-000000000099");
            var denied=http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/orbit/money/v1/accounts")).header("Authorization","Bearer "+delegated).build(),HttpResponse.BodyHandlers.ofString());assertThat(denied.statusCode()).isEqualTo(403);
        }finally{cleanupMoneyConsole(user);}
    }
    @Test void moneyConsoleFrozenColorPlanAndFinancialDryRunPreserveCanonicalRecords()throws Exception{
        UUID user=UUID.randomUUID();db.update("insert into auth.users(id) values(?)",user);
        try{
            UUID account=UUID.randomUUID(),fact=UUID.randomUUID(),category=UUID.randomUUID();
            db.update("insert into money_accounts(id,user_id,provider,display_name,role) values(?,?,'TEST','Synthetic account','SPENDING')",account,user);
            db.update("insert into money_transactions(id,user_id,type,meaning_state,from_account_id,amount,occurred_at,title) values(?,?,'EXPENSE','UNRESOLVED',?,1200,now(),'Synthetic unresolved')",fact,user,account);
            db.update("insert into money_categories(id,user_id,name,color,kind) values(?,?,'Synthetic category','#123456','EXPENSE')",category,user);
            var detail=console(user,"financial-detail?id="+fact,"GET",null);assertThat(detail.statusCode()).as(detail.body()).isEqualTo(200);var financialFact=json.readTree(detail.body()).get("data").get("fact");assertThat(financialFact.get("meaning_state").asText()).isEqualTo("UNRESOLVED");assertThat(financialFact.get("amount").asInt()).isEqualTo(1200);assertThat(financialFact.get("from_account_id").asText()).isEqualTo(account.toString());assertThatCode(()->Instant.parse(financialFact.get("occurred_at").asText())).doesNotThrowAnyException();assertThat(financialFact.has("sources")).isTrue();assertThat(financialFact.has("user_id")).isFalse();assertThat(console(other,"financial-detail?id="+fact,"GET",null).statusCode()).isBetween(400,499);
            var preview=console(user,"preview/category-color-plan","POST",Map.of("items",List.of(Map.of("categoryId",category,"color","#abcdef","expectedColor","#123456","expectedVersion",0))));assertThat(preview.statusCode()).as(preview.body()).isEqualTo(200);
            var p=json.readTree(preview.body()).get("data");var execute=Map.of("requestId",UUID.randomUUID(),"previewId",p.get("previewId").asText(),"fingerprint",p.get("fingerprint").asText(),"confirmed",true);
            assertThat(console(user,"execute/category-color-plan","POST",execute).body()).contains("APPLIED","#abcdef");
            assertThat(console(user,"execute/category-color-plan","POST",execute).body()).contains("APPLIED");
            var financial=console(user,"preview/financial-correction","POST",Map.of("id",fact,"expectedVersion",0,"action","TYPE","type","EXPENSE"));assertThat(financial.statusCode()).as(financial.body()).isEqualTo(200);
            assertThat(db.queryForObject("select meaning_state from money_transactions where user_id=? and id=?",String.class,user,fact)).isEqualTo("UNRESOLVED");
            var fp=json.readTree(financial.body()).get("data");
            // An independent account setting change must stale the financial impact plan even when fact version is unchanged.
            db.update("update money_accounts set display_name='Changed synthetic account',version=version+1 where user_id=? and id=?",user,account);
            var stale=Map.of("requestId",UUID.randomUUID(),"previewId",fp.get("previewId").asText(),"fingerprint",fp.get("fingerprint").asText(),"confirmed",true);
            assertThat(console(user,"execute/financial-correction","POST",stale).body()).contains("NOT_APPLIED","PREVIEW_STALE");
            assertThat(db.queryForObject("select meaning_state from money_transactions where user_id=? and id=?",String.class,user,fact)).isEqualTo("UNRESOLVED");
            var fresh=console(user,"preview/financial-correction","POST",Map.of("id",fact,"expectedVersion",0,"action","TYPE","type","EXPENSE"));assertThat(fresh.statusCode()).as(fresh.body()).isEqualTo(200);fp=json.readTree(fresh.body()).get("data");var confirmed=Map.of("requestId",UUID.randomUUID(),"previewId",fp.get("previewId").asText(),"fingerprint",fp.get("fingerprint").asText(),"confirmed",true);
            var corrected=console(user,"execute/financial-correction","POST",confirmed);assertThat(corrected.statusCode()).as(corrected.body()).isEqualTo(200);assertThat(corrected.body()).contains("APPLIED");
            assertThat(db.queryForObject("select meaning_state from money_transactions where user_id=? and id=?",String.class,user,fact)).isEqualTo("CONFIRMED");
            assertThat(db.queryForObject("select count(*) from money_transactions where user_id=?",Long.class,user)).isEqualTo(1);assertThat(db.queryForObject("select amount from money_transactions where user_id=? and id=?",Integer.class,user,fact)).isEqualTo(1200);
            UUID raw=UUID.randomUUID();db.update("insert into money_raw_notifications(id,user_id,posted_at,raw_payload,dedupe_key,content_hash,state) values(?,?,now(),'{}',?,?,'PROCESSED')",raw,user,raw.toString(),raw.toString());db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,relationship,evidence) values(?,?,?,'PRIMARY',cast(? as jsonb))",fact,user,raw,"{\"rawBody\":\"PRIVATE_SOURCE_BODY\",\"accountHint\":\"PRIVATE_ACCOUNT_HINT\",\"reason\":\"SOURCE_MATCH\"}");var privateEvidence=console(user,"financial-detail?id="+fact,"GET",null);assertThat(privateEvidence.statusCode()).as(privateEvidence.body()).isEqualTo(200);assertThat(privateEvidence.body()).contains("SOURCE_MATCH",raw.toString()).doesNotContain("PRIVATE_SOURCE_BODY","PRIVATE_ACCOUNT_HINT");
        }finally{cleanupMoneyConsole(user);}
    }
    Map<String,Object> classifyTarget(UUID user,UUID fact,UUID category)throws Exception{
        var r=console(user,"bookkeeping-item?id="+fact,"GET",null);assertThat(r.statusCode()).as(r.body()).isEqualTo(200);var data=json.readTree(r.body()).get("data");var b=data.get("book");var c=data.get("classification");
        var out=new LinkedHashMap<String,Object>();out.put("id",fact);out.put("transactionVersion",b.get("transactionVersion").asLong());out.put("overrideVersion",b.get("version").asLong());out.put("projectionVersion",b.get("projectionVersion").asLong());out.put("classificationVersion",c.get("version").asLong());out.put("categoryId",category);return out;
    }
    @Test void moneyConsoleClassificationProtectsDirectChoicesAndRecoversExactOutcomes()throws Exception{
        UUID user=UUID.randomUUID();db.update("insert into auth.users(id) values(?)",user);
        try{
            UUID account=UUID.randomUUID(),a=UUID.randomUUID(),b=UUID.randomUUID(),category=UUID.randomUUID(),otherCategory=UUID.randomUUID();
            db.update("insert into money_accounts(id,user_id,provider,display_name,role) values(?,?,'TEST','Synthetic classification account','SPENDING')",account,user);
            db.update("insert into money_tracking_settings(user_id) values(?)",user);
            db.update("insert into money_tracking_accounts(user_id,account_id,kind,slot) values(?,?,'EXPENSE',1)",user,account);
            for(UUID fact:List.of(a,b))db.update("insert into money_transactions(id,user_id,type,from_account_id,amount,occurred_at,title,counterparty_text) values(?,?,'EXPENSE',?,1000,now(),'Synthetic purchase','Synthetic merchant')",fact,user,account);
            for(UUID cat:List.of(category,otherCategory))db.update("insert into money_categories(id,user_id,name,color,kind) values(?,?,?,'#123456','EXPENSE')",cat,user,"Category "+cat);
            var single=Map.of("requestId",UUID.randomUUID(),"items",List.of(classifyTarget(user,a,category)));var saved=console(user,"bookkeeping-category","POST",single);assertThat(saved.statusCode()).as(saved.body()).isEqualTo(200);assertThat(saved.body()).contains("APPLIED");
            var bulk=Map.of("requestId",UUID.randomUUID(),"items",List.of(classifyTarget(user,a,otherCategory),classifyTarget(user,b,otherCategory)));var changed=console(user,"bulk-classify","POST",bulk);assertThat(changed.statusCode()).as(changed.body()).isEqualTo(200);assertThat(changed.body()).contains("DIRECT_PROTECTED",b.toString());
            assertThat(console(user,"bookkeeping-item?id="+a,"GET",null).body()).contains(category.toString());assertThat(console(user,"bookkeeping-item?id="+b,"GET",null).body()).contains(otherCategory.toString());
            assertThat(console(user,"bulk-classify","POST",bulk).body()).contains("DIRECT_PROTECTED");assertThat(console(user,"operation-outcome?requestId="+bulk.get("requestId"),"GET",null).body()).contains("DIRECT_PROTECTED");
            assertThat(console(other,"bookkeeping-item?id="+a,"GET",null).statusCode()).isBetween(400,499);
            assertThat(db.queryForObject("select sum(amount) from money_transactions where user_id=?",Integer.class,user)).isEqualTo(2000);
            assertThat(db.queryForObject("select count(*) from money_transactions where user_id=?",Long.class,user)).isEqualTo(2);
            var candidates=console(user,"review-candidates?id="+a+"&kind=TRANSACTION","GET",null);assertThat(candidates.statusCode()).as(candidates.body()).isEqualTo(200);var links=json.readTree(candidates.body()).get("data");assertThat(links.get("transferCandidates").get("items").isArray()).isTrue();assertThat(links.get("refundCandidates").get("items").isArray()).isTrue();assertThat(links.get("candidatePolicy").asText()).contains("NOT_CONFIRMED_LINKS");assertThat(console(other,"review-candidates?id="+a+"&kind=TRANSACTION","GET",null).statusCode()).isBetween(400,499);
            var attention=console(user,"attention","GET",null);assertThat(attention.statusCode()).as(attention.body()).isEqualTo(200);assertThat(json.readTree(attention.body()).get("data").get("uncategorizedExpense").asLong()).isZero();
        }finally{db.update("delete from money_tracking_accounts where user_id=?",user);db.update("delete from money_tracking_settings where user_id=?",user);cleanupMoneyConsole(user);}
    }
}
