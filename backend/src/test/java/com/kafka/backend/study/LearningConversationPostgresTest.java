package com.kafka.backend.study;

import static com.kafka.backend.study.StudyValidation.JSON;
import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import com.kafka.backend.orbit.OrbitMoneyProofFilter;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@EnabledIfEnvironmentVariable(named="STUDY_TEST_DB",matches="jdbc:postgresql://127\\.0\\.0\\.1:554(?:49|52)/postgres")
@SpringBootTest(classes=LearningConversationPostgresTest.Config.class,properties={"spring.flyway.enabled=false","spring.jpa.hibernate.ddl-auto=none","spring.datasource.hikari.maximum-pool-size=4"})
class LearningConversationPostgresTest {
    static final long T=Instant.parse("2026-10-31T14:59:40Z").getEpochSecond();
    static final AtomicLong time=new AtomicLong();
    static final UUID OWNER=UUID.randomUUID(),OTHER=UUID.randomUUID();
    static final ThreadLocal<UUID> user=ThreadLocal.withInitial(()->OWNER);
    @Configuration @EnableAutoConfiguration @Import({LearningRecords.class,LearningQueries.class,LearningActivity.class})
    static class Config {
        @Bean LearningCommands commands(LearningRecords r){
            return new LearningCommands(r,user::get,new Clock(){
                public ZoneId getZone(){return ZoneOffset.UTC;}
                public Clock withZone(ZoneId zone){return this;}
                public Instant instant(){return Instant.ofEpochSecond(time.get());}
            });
        }
    }
    @DynamicPropertySource static void props(DynamicPropertyRegistry p){
        p.add("spring.datasource.url",()->System.getenv("STUDY_TEST_DB")+"?currentSchema=learning_test,public");
        p.add("spring.datasource.username",()->"study_test");p.add("spring.datasource.password",()->"");
    }
    @Autowired LearningCommands commands;
    @Autowired LearningQueries read;
    @Autowired LearningActivity activity;
    @Autowired JdbcTemplate db;
    @BeforeEach void setup()throws Exception{
        user.remove();time.set(T);
        db.execute("drop schema if exists learning_test cascade");db.execute("create schema learning_test");
        db.update("insert into auth.users values(?),(?) on conflict do nothing",OWNER,OTHER);
        db.execute(Files.readString(Path.of("src/main/resources/db/migration/V135__study_conversation_log.sql")));
    }
    ObjectNode op(){return JSON.createObjectNode().put("operationKey",UUID.randomUUID().toString());}
    ObjectNode cmd(int rev){return op().put("expectedRevision",rev);}
    UUID start(){return UUID.fromString(commands.execute("start",null,op(),true).path("sessionId").asString());}
    ObjectNode summary(){
        var s=JSON.createObjectNode().put("title","합성 학습").put("summary","테스트").put("summaryCoverage","PARTIAL_CONTEXT");
        for(String k:List.of("topics","keyTakeaways","userInsights","openQuestions"))s.putArray(k);return s;
    }
    ObjectNode finish(int rev){return cmd(rev).set("summary",summary());}
    final String secret="1".repeat(64);
    String challenge(UUID id,String token){return activity.challenge(id,JSON.createObjectNode().put("deviceHash",OrbitMoneyProofFilter.digest(token))).path("challenge").asString();}
    JsonNode bind(String challenge,String token){return activity.bind(token,JSON.createObjectNode().put("challenge",challenge));}
    ObjectNode batch(long generation,long sequence,long left,long right,String state){
        var b=JSON.createObjectNode().put("generation",generation).put("batchId",UUID.randomUUID().toString());
        b.putArray("events").addObject().put("sequence",sequence).put("start",left).put("end",right).put("state",state);return b;
    }
    @Test void concurrentFirstStartReplayAndCompetingFinish()throws Exception{
        var key=op();var jobs=new ArrayList<Callable<JsonNode>>();
        for(int i=0;i<8;i++){var body=i%2==0?key:op();jobs.add(()->commands.execute("start",null,body,true));}
        try(var pool=Executors.newFixedThreadPool(4)){
            var futures=pool.invokeAll(jobs);var id=UUID.fromString(futures.getFirst().get().path("sessionId").asString());
            for(var f:futures)assertThat(f.get().path("sessionId").asString()).isEqualTo(id.toString());
            var done=finish(1);var same=pool.invokeAll(List.<Callable<JsonNode>>of(()->commands.execute("complete",id,done,true),()->commands.execute("complete",id,done,true)));
            assertThat(same.getFirst().get()).isEqualTo(same.getLast().get());
            assertThat(commands.execute("start",null,key,true).path("status").asString()).isEqualTo("ACTIVE");
            assertThatThrownBy(()->commands.execute("start",null,key.put("title","다름"),true)).isInstanceOf(StudyException.class);
            assertThatThrownBy(()->commands.execute("pause",id,cmd(1),true)).isInstanceOf(StudyException.class);
            assertThat(read.detail(id).path("original").path("elapsedSeconds").asInt()).isZero();
        }
    }
    @Test void measuredMidnightManualPauseCheckpointAndFreeze(){
        UUID id=start();var code=challenge(id,secret);
        assertThatThrownBy(()->bind(code,"2".repeat(64))).isInstanceOf(StudyException.class);
        bind(code,secret);assertThatThrownBy(()->bind(code,secret)).isInstanceOf(StudyException.class);
        time.set(T+15);commands.execute("pause",id,cmd(1),true);
        time.set(T+25);commands.execute("resume",id,cmd(2),true);
        time.set(T+40);var b=batch(1,1,T,T+40,"STUDYING");activity.ingest(secret,b,false);activity.ingest(secret,b,false);
        commands.execute("checkpoints",id,cmd(3).set("summary",summary()),true);
        assertThat(read.context(3,"").at("/current/checkpoint/summary/title").asString()).isEqualTo("합성 학습");
        time.set(T+50);var done=commands.execute("complete",id,finish(4),true);
        assertThat(done.at("/original/measuredSeconds").asInt()).isEqualTo(30);
        assertThat(done.at("/original/manualPausedSeconds").asInt()).isEqualTo(10);
        assertThat(done.at("/original/unobservedSeconds").asInt()).isEqualTo(10);
        assertThat(done.path("allocations").size()).isEqualTo(2);
        assertThat(read.statistics(LocalDate.parse("2026-11-01"),LocalDate.parse("2026-11-02")).path("totalSeconds").asInt()).isEqualTo(15);
        assertThatThrownBy(()->activity.ingest(secret,b,false)).isInstanceOf(StudyException.class);
        user.set(OTHER);assertThatThrownBy(()->read.detail(id)).isInstanceOf(StudyException.class);
        assertThat(read.current().path("session").isNull()).isTrue();
    }
    @Test void gapsSequenceFencingClockAndExpiry(){
        UUID id=start();bind(challenge(id,secret),secret);time.set(T+20);
        assertThatThrownBy(()->activity.ingest(secret,batch(1,2,T,T+10,"AWAY"),false)).isInstanceOf(StudyException.class);
        assertThatThrownBy(()->activity.ingest(secret,batch(1,1,T,T+21,"IDLE"),false)).isInstanceOf(StudyException.class);
        activity.ingest(secret,batch(1,1,T+10,T+20,"IDLE"),false);
        assertThatThrownBy(()->activity.ingest(secret,batch(1,1,T+10,T+20,"AWAY"),false)).isInstanceOf(StudyException.class);
        String newToken="2".repeat(64);bind(challenge(id,newToken),newToken);
        assertThatThrownBy(()->activity.ingest(secret,batch(1,2,T+20,T+25,"AWAY"),false)).isInstanceOf(StudyException.class);
        time.set(T+150);assertThatThrownBy(()->activity.ingest(newToken,batch(2,1,T+20,T+30,"AWAY"),false)).isInstanceOf(StudyException.class);
        var done=commands.execute("complete",id,finish(1),true);
        assertThat(done.at("/original/idleSeconds").asInt()).isEqualTo(10);
        assertThat(done.at("/original/unobservedSeconds").asInt()).isEqualTo(140);
    }
    @Test void correctionsPreserveOriginalAndRejectOverlapOnRestore(){
        UUID id=start();time.set(T+40);var done=commands.execute("complete",id,finish(1),true);
        var correction=cmd(2).put("reason","확인된 날짜별 정정");
        correction.putArray("allocations").addObject().put("date","2026-10-31").put("effectiveSeconds",18);
        commands.execute("update",id,correction,false);
        assertThat(read.detail(id).path("original")).isEqualTo(done.path("original"));
        commands.execute("delete",id,cmd(3).put("reason","합성 삭제"),false);
        var manual=op().put("reason","합성 입력").put("effectiveStart",LearningRecords.iso(T)).put("effectiveEnd",LearningRecords.iso(T+40));
        manual.set("summary",summary());manual.set("allocations",correction.get("allocations"));
        var other=commands.execute("manual",null,manual,false);
        assertThatThrownBy(()->commands.execute("restore",id,cmd(4).put("reason","복원"),false)).isInstanceOf(StudyException.class);
        commands.execute("delete",UUID.fromString(other.path("sessionId").asString()),cmd(1).put("reason","합성 삭제"),false);
        commands.execute("restore",id,cmd(4).put("reason","복원"),false);
        var day=LocalDate.parse("2026-10-31");assertThat(read.list(day,day.plusDays(1),"",20,false).at("/items/0/sliceSeconds").asInt()).isEqualTo(18);
    }
}
