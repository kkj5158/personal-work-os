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
    Challenge challenge(UUID item){return new Challenge(UUID.randomUUID(),"도전",ChallengeType.CHECKLIST,ChallengeStatus.ACTIVE,day.minusDays(3),day.plusDays(7),"#dc6578","핵심",List.of("메모"),0,null,null,List.of(item),GoalMode.RATE,true,null,80d,ChallengeRole.CURRENT_FOCUS,0);}
    @Test void partialMeasurementsClearingAndCheckTogglesRoundTrip(){
        var i=item("야식 참기",0);service.item(i.id(),i);
        service.day(day,new DailyRecord(day,90d,null,null,null,null,null,null,null,null,null));
        service.day(day,new DailyRecord(day,null,null,95d,null,null,null,null,null,null,16d));
        service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.SUCCESS,"메모"));
        service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.FAILURE,"변경"));
        assertThat(service.data().checks().getFirst().state()).isEqualTo(CheckState.FAILURE);
        service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.UNRECORDED,"여행"));
        assertThat(service.data().checks()).containsExactly(new DailyCheck(day,i.id(),CheckState.UNRECORDED,"여행"));
        service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.MISSING,"보존"));
        var data=service.data();assertThat(data.days()).hasSize(1);assertThat(data.days().getFirst().morningWeight()).isNull();
        assertThat(data.days().getFirst().morningGlucose()).isEqualTo(95d);assertThat(data.days().getFirst().fastingHours()).isEqualTo(16d);
        assertThat(data.checks()).containsExactly(new DailyCheck(day,i.id(),CheckState.MISSING,"보존"));
    }
    @Test void challengeMembershipSnapshotAndArchivedHistoryPersist(){
        var i=item("운동",0);service.item(i.id(),i);var c=challenge(i.id());service.challenge(c.id(),c);
        service.item(i.id(),new ChecklistItem(i.id(),i.title(),Importance.OPTIONAL,i.keyPoint(),0,6,24,true,i.startDate()));
        service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.UNRECORDED,"보존"));
        service.delete("items",i.id());var data=service.data();assertThat(data.items().getFirst().active()).isFalse();
        assertThat(data.checks()).containsExactly(new DailyCheck(day,i.id(),CheckState.UNRECORDED,"보존"));
        assertThat(data.challenges().getFirst().itemIds()).containsExactly(i.id());assertThat(data.challenges().getFirst().notes()).containsExactly("메모");
    }
    @Test void batchChecksAreAtomicPreserveMemosAndKeepNotRecordedDistinct(){
        var a=item("A",0);var b=item("B",1);service.item(a.id(),a);service.item(b.id(),b);
        service.check(day,a.id(),new DailyCheck(day,a.id(),CheckState.SUCCESS,"메모 유지"));
        service.checks(new CheckChanges(List.of(new CheckChange(day,a.id(),CheckState.UNRECORDED),new CheckChange(day,b.id(),CheckState.UNRECORDED))));
        assertThat(service.data().checks()).containsExactlyInAnyOrder(new DailyCheck(day,a.id(),CheckState.UNRECORDED,"메모 유지"),new DailyCheck(day,b.id(),CheckState.UNRECORDED,""));
        assertThatThrownBy(()->service.checks(new CheckChanges(List.of(new CheckChange(day,a.id(),CheckState.FAILURE),new CheckChange(day.minusDays(30),b.id(),CheckState.FAILURE))))).isInstanceOf(InvalidRequestException.class);
        assertThat(service.data().checks()).extracting(DailyCheck::state).containsOnly(CheckState.UNRECORDED);
    }
    @Test void deleteArchivesWithIntervalAndRestoreContinuesTheSameItem(){
        var i=item("야식 참기",0);service.item(i.id(),i);
        service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.SUCCESS,""));
        service.delete("items",i.id());service.delete("items",i.id());
        var archived=service.data();
        assertThat(archived.items().getFirst().active()).isFalse();
        assertThat(archived.archivePeriods()).hasSize(1).allMatch(p->p.itemId().equals(i.id())&&p.restoredOn()==null);
        assertThat(archived.checks()).containsExactly(new DailyCheck(day,i.id(),CheckState.SUCCESS,""));
        service.restore(i.id());
        var restored=service.data();
        assertThat(restored.items().getFirst().id()).isEqualTo(i.id());assertThat(restored.items().getFirst().active()).isTrue();
        assertThat(restored.archivePeriods()).hasSize(1).allMatch(p->p.restoredOn()!=null);
        // Toggling active off/on through edit follows the same archive semantics.
        service.item(i.id(),new ChecklistItem(i.id(),i.title(),i.importance(),i.keyPoint(),0,6,24,false,i.startDate()));
        assertThat(service.data().archivePeriods()).hasSize(2);
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
        var goal=new WeightGoal(UUID.randomUUID(),GoalKind.FINAL,day,80d,"",List.of());service.goal(goal.id(),goal);
        user.id=UUID.randomUUID();db.update("insert into auth.users(id) values(?)",user.id);
        assertThat(service.data().items()).isEmpty();assertThat(service.data().challenges()).isEmpty();assertThat(service.data().goals()).isEmpty();
        assertThatThrownBy(()->service.item(i.id(),i)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.check(day,i.id(),new DailyCheck(day,i.id(),CheckState.SUCCESS,""))).isInstanceOf(ResourceNotFoundException.class);
        var foreignChallenge=challenge(i.id());assertThatThrownBy(()->service.challenge(foreignChallenge.id(),foreignChallenge)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.goal(goal.id(),goal)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.order("items",new OrderInput(List.of(i.id())))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->service.delete("challenges",c.id())).isInstanceOf(ResourceNotFoundException.class);
    }
    Challenge weight(int order,ChallengeRole role){return new Challenge(UUID.randomUUID(),"Weight",ChallengeType.WEIGHT,ChallengeStatus.ACTIVE,day,day.plusDays(30),"#bc3456","",List.of(),order,90d,80d,List.of(),GoalMode.RATE,true,null,null,role,order);}
    @Test void globalGoalHistoryAndMemosRemainIndependentFromChallengeLifecycle(){
        var c=weight(0,ChallengeRole.FINAL_GOAL);service.challenge(c.id(),c);
        assertThat(service.data().goals()).isEmpty();
        var weekly=new WeightGoal(UUID.randomUUID(),GoalKind.WEEKLY,day.plusDays(7),88d,"Weekly focus",List.of("First","Second"));
        var later=new WeightGoal(UUID.randomUUID(),GoalKind.WEEKLY,day.plusDays(14),86d,"Next week",List.of());
        var monthly=new WeightGoal(UUID.randomUUID(),GoalKind.MONTHLY,day.plusDays(30),80d,"Month",List.of());
        var nextMonth=new WeightGoal(UUID.randomUUID(),GoalKind.MONTHLY,day.plusDays(60),75d,"Next month",List.of());
        for(var g:List.of(weekly,later,monthly,nextMonth))service.goal(g.id(),g);
        var milestone=new Milestone(UUID.randomUUID(),c.id(),day.plusDays(15),85d,"Halfway","",List.of("One","Two"));
        service.milestone(milestone.id(),milestone);
        assertThat(service.data().milestones()).containsExactly(milestone);
        assertThat(service.data().challenges().getFirst().role()).isEqualTo(ChallengeRole.FINAL_GOAL);
        service.delete("challenges",c.id());
        assertThat(service.data().goals()).containsExactly(weekly,later,monthly,nextMonth);assertThat(service.data().milestones()).isEmpty();
        service.delete("goals",weekly.id());assertThat(service.data().goals()).containsExactly(later,monthly,nextMonth);
    }
    @Test void legacyChallengeGoalsArePreservedAndHomeOrderIsTypeScoped(){
        var a=weight(0,ChallengeRole.CURRENT_FOCUS);var b=weight(1,ChallengeRole.NEXT_FOCUS);
        service.challenge(a.id(),a);service.challenge(b.id(),b);
        UUID legacy=UUID.randomUUID();db.update("insert into diet_goals(id,owner_id,challenge_id,kind,entry_date,value) values(?,?,?,'FINAL',?,?)",legacy,user.id,a.id(),day.plusDays(10),77d);
        service.challenge(a.id(),a);
        assertThat(db.queryForObject("select value from diet_goals where id=?",Double.class,legacy)).isEqualTo(77d);
        assertThat(service.data().goals()).isEmpty();
        var i=item("Checklist",0);service.item(i.id(),i);var c=challenge(i.id());service.challenge(c.id(),c);
        service.homeOrder(new HomeOrderInput(ChallengeType.WEIGHT,List.of(b.id(),a.id())));
        var data=service.data();
        assertThat(data.challenges().stream().filter(ch->ch.id().equals(a.id())).findFirst().orElseThrow().homeSortOrder()).isEqualTo(1);
        assertThat(data.challenges().stream().filter(ch->ch.id().equals(b.id())).findFirst().orElseThrow().sortOrder()).isEqualTo(1);
        assertThat(data.challenges().stream().filter(ch->ch.id().equals(c.id())).findFirst().orElseThrow().homeSortOrder()).isZero();
        assertThatThrownBy(()->service.homeOrder(new HomeOrderInput(ChallengeType.WEIGHT,List.of(c.id())))).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void goalBaselinePersistsIndependentlyFromActualMeasurements(){
        var goal=new WeightGoal(UUID.randomUUID(),GoalKind.WEEKLY,day.plusDays(10),80d,"Plan",List.of(),day,90d);
        service.goal(goal.id(),goal);
        service.day(day.plusDays(5),new DailyRecord(day.plusDays(5),100d,null,null,null,null,null,null,null,null,null));
        assertThat(service.data().goals()).containsExactly(goal);
        service.day(day.plusDays(5),new DailyRecord(day.plusDays(5),70d,null,null,null,null,null,null,null,null,null));
        assertThat(service.data().goals()).containsExactly(goal);
    }
    @Test void milestonesSupportManualAndChecklistChallenges(){
        var i=item("Test",0);service.item(i.id(),i);var checklist=challenge(i.id());service.challenge(checklist.id(),checklist);
        var manual=new Challenge(UUID.randomUUID(),"Manual",ChallengeType.MANUAL,ChallengeStatus.ACTIVE,day,day.plusDays(10),"#bc3456","",List.of(),1,null,null,List.of(),GoalMode.COUNT,true,0d,10d,ChallengeRole.CURRENT_FOCUS,0);
        service.challenge(manual.id(),manual);
        for(var c:List.of(checklist,manual)){var m=new Milestone(UUID.randomUUID(),c.id(),day.plusDays(5),5d,"Halfway","",List.of());service.milestone(m.id(),m);}
        assertThat(service.data().milestones()).hasSize(2);
    }
}
