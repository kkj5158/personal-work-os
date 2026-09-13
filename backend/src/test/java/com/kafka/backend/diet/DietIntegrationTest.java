package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.kafka.backend.diet.DietTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Opt-in PostgreSQL persistence coverage. All fixtures (including auth owners) roll back.
 * This test never applies migrations or modifies schema history. */
@EnabledIfEnvironmentVariable(named="DIET_DB_TEST",matches="true")
@SpringJUnitConfig(DietIntegrationTest.Config.class)
@Transactional
class DietIntegrationTest {
    static class TestUser implements CurrentUserProvider { UUID id; public UUID getCurrentUserId(){return id;} }
    @Configuration @EnableTransactionManagement static class Config {
        @Bean DriverManagerDataSource datasource(){return new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));}
        @Bean JdbcTemplate db(DriverManagerDataSource ds){return new JdbcTemplate(ds);}
        @Bean DataSourceTransactionManager transactionManager(DriverManagerDataSource ds){return new DataSourceTransactionManager(ds);}
        @Bean TestUser users(){return new TestUser();}
        @Bean ObjectMapper json(){return JsonMapper.builder().build();}
        @Bean DietService service(JdbcTemplate db,TestUser users,ObjectMapper json){return new DietService(db,users,json);}
    }
    @Autowired DietService service; @Autowired JdbcTemplate db; @Autowired TestUser user;
    LocalDate day=LocalDate.of(2026,9,14);
    @BeforeEach void owner(){user.id=UUID.randomUUID();db.update("insert into auth.users(id) values(?)",user.id);}
    ChecklistItem item(String title,int order){return new ChecklistItem(UUID.randomUUID(),title,Importance.CORE,"핵심",order,6,24,true,day.minusDays(7));}
    Challenge challenge(UUID item){return new Challenge(UUID.randomUUID(),"도전",ChallengeType.CHECKLIST,ChallengeStatus.ACTIVE,day.minusDays(3),day.plusDays(7),"#dc6578","핵심",List.of("메모"),0,null,null,List.of(item),GoalMode.RATE,true,null,80d);}
    @Test void partialMeasurementsClearingAndCheckTogglesRoundTrip(){
        var i=item("야식 참기",0);service.item(i.id(),i);
        service.day(day,new DailyRecord(day,90d,null,null,null,null,null,null,null,null,null));
        service.day(day,new DailyRecord(day,null,null,95d,null,null,null,null,null,null,16d));
        service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.SUCCESS,"메모"));
        service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.FAILURE,"변경"));
        assertThat(service.data().checks().getFirst().state()).isEqualTo(CheckState.FAILURE);
        service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.MISSING,"보존"));
        var data=service.data();assertThat(data.days()).hasSize(1);assertThat(data.days().getFirst().morningWeight()).isNull();
        assertThat(data.days().getFirst().morningGlucose()).isEqualTo(95d);assertThat(data.days().getFirst().fastingHours()).isEqualTo(16d);
        assertThat(data.checks()).containsExactly(new DailyCheck(day,i.id(),CheckState.MISSING,"보존"));
    }
    @Test void challengeMembershipSnapshotAndArchivedHistoryPersist(){
        var i=item("운동",0);service.item(i.id(),i);var c=challenge(i.id());service.challenge(c.id(),c);
        service.item(i.id(),new ChecklistItem(i.id(),i.title(),Importance.OPTIONAL,i.keyPoint(),0,6,24,true,i.startDate()));
        service.delete("items",i.id());var data=service.data();assertThat(data.items().getFirst().active()).isFalse();
        assertThat(data.challenges().getFirst().itemIds()).containsExactly(i.id());assertThat(data.challenges().getFirst().notes()).containsExactly("메모");
    }
    @Test void subsetOrderPreservesUnselectedPositionAndSettingsReload(){
        var a=item("A",0);var b=item("B",1);var c=item("C",2);
        for(var item:List.of(a,b,c))service.item(item.id(),item);
        service.order("items",new OrderInput(List.of(c.id(),a.id())));
        assertThat(service.data().items().stream().map(ChecklistItem::id)).containsExactly(c.id(),b.id(),a.id());
        Map<String,Object> settings=Map.of("weightLines",List.of(Map.of("id","one","name","개인 목표","value",75,"visible",true)));
        service.settings(settings);assertThat(service.data().settings()).isEqualTo(settings);
    }
    @Test void ownerIsolationRejectsForeignReferencesAndIdOverwrite(){
        var i=item("Private",0);service.item(i.id(),i);var c=challenge(i.id());service.challenge(c.id(),c);
        user.id=UUID.randomUUID();db.update("insert into auth.users(id) values(?)",user.id);
        assertThat(service.data().items()).isEmpty();assertThat(service.data().challenges()).isEmpty();
        assertThatThrownBy(()->service.item(i.id(),i)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.SUCCESS,""))).isInstanceOf(ResourceNotFoundException.class);
        var foreignChallenge=challenge(i.id());assertThatThrownBy(()->service.challenge(foreignChallenge.id(),foreignChallenge)).isInstanceOf(ResourceNotFoundException.class);
        var goal=new WeightGoal(UUID.randomUUID(),c.id(),GoalKind.FINAL,day,80d);
        assertThatThrownBy(()->service.goal(goal.id(),goal)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.order("items",new OrderInput(List.of(i.id())))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.delete("challenges",c.id())).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void weightPlanGoalsMilestonesCascadeOnlyWithOwnedChallenge(){
        var c=new Challenge(UUID.randomUUID(),"Weight",ChallengeType.WEIGHT,ChallengeStatus.ACTIVE,day,day.plusDays(30),"#bc3456","",List.of(),0,90d,80d,List.of(),GoalMode.RATE,true,null,null);
        service.challenge(c.id(),c);var goal=new WeightGoal(UUID.randomUUID(),c.id(),GoalKind.FINAL,day.plusDays(30),80d);
        var milestone=new Milestone(UUID.randomUUID(),c.id(),day.plusDays(15),85d,"중간","메모");
        service.goal(goal.id(),goal);service.milestone(milestone.id(),milestone);
        assertThat(service.data().goals()).containsExactly(goal);assertThat(service.data().milestones()).containsExactly(milestone);
        service.delete("challenges",c.id());assertThat(service.data().goals()).isEmpty();assertThat(service.data().milestones()).isEmpty();
    }
    @Test void challengeAndFinalGoalStaySynchronizedAndPlanningCannotBeSilentlyDiscarded(){
        var c=new Challenge(UUID.randomUUID(),"Weight",ChallengeType.WEIGHT,ChallengeStatus.ACTIVE,day,day.plusDays(30),"#bc3456","",List.of(),0,90d,80d,List.of(),GoalMode.RATE,true,null,null);
        service.challenge(c.id(),c);var initial=service.data().goals().getFirst();
        assertThat(initial.challengeId()).isEqualTo(c.id());assertThat(initial.value()).isEqualTo(80d);assertThat(initial.date()).isEqualTo(c.endDate());
        var changed=new WeightGoal(initial.id(),c.id(),GoalKind.FINAL,day.plusDays(40),78d);service.goal(changed.id(),changed);
        assertThat(service.data().challenges().getFirst().targetWeight()).isEqualTo(78d);assertThat(service.data().challenges().getFirst().endDate()).isEqualTo(changed.date());
        var manual=new Challenge(c.id(),"Manual",ChallengeType.MANUAL,ChallengeStatus.ACTIVE,day,day.plusDays(40),"#bc3456","",List.of(),0,null,null,List.of(),GoalMode.COUNT,true,0d,10d);
        assertThatThrownBy(()->service.challenge(c.id(),manual)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.delete("goals",initial.id())).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.goal(initial.id(),new WeightGoal(initial.id(),null,GoalKind.WEEKLY,day,85d))).isInstanceOf(InvalidRequestException.class);
        assertThat(service.data().goals()).containsExactly(changed);
    }
    @Test void milestonesSupportManualAndChecklistChallenges(){
        var i=item("Test",0);service.item(i.id(),i);var checklist=challenge(i.id());service.challenge(checklist.id(),checklist);
        var manual=new Challenge(UUID.randomUUID(),"Manual",ChallengeType.MANUAL,ChallengeStatus.ACTIVE,day,day.plusDays(10),"#bc3456","",List.of(),1,null,null,List.of(),GoalMode.COUNT,true,0d,10d);
        service.challenge(manual.id(),manual);
        for(var c:List.of(checklist,manual)){var m=new Milestone(UUID.randomUUID(),c.id(),day.plusDays(5),5d,"Halfway","");service.milestone(m.id(),m);}
        assertThat(service.data().milestones()).hasSize(2);
    }
}
