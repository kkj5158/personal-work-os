package com.kafka.backend.reflection;

import com.kafka.backend.calendar.*;
import com.kafka.backend.common.*;
import com.kafka.backend.workrecord.WorkRecordRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.core.io.ClassPathResource;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.kafka.backend.reflection.CalendarReviewTypes.*;

@EnabledIfEnvironmentVariable(named="QA_REVIEW_PG_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:.*")
class CalendarReviewPostgresTest {
    JdbcTemplate root,db;TransactionTemplate tx;CalendarReviewService service;String schema;
    UUID alice=UUID.randomUUID(),bob=UUID.randomUUID();AtomicReference<UUID> current=new AtomicReference<>();
    LocalDate monday=LocalDate.of(2026,9,28);
    @BeforeEach void setup(){
        String url=System.getenv("QA_REVIEW_PG_URL"),user=System.getenv("QA_REVIEW_PG_USERNAME");
        root=new JdbcTemplate(new DriverManagerDataSource(url,user,""));schema="review_"+UUID.randomUUID().toString().replace("-","");root.execute("create schema "+schema);
        root.update("insert into auth.users(id) values (?),(?)",alice,bob);
        var ds=new DriverManagerDataSource(url+"?currentSchema="+schema,user,"");db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V31__create_reflection_entries.sql"),new ClassPathResource("db/migration/V96__reflection_daily_annotations.sql"),new ClassPathResource("db/migration/V97__calendar_weekly_reviews.sql")).execute(ds);
        current.set(alice);var calendar=mock(CalendarService.class);var work=mock(WorkRecordRepository.class);
        when(calendar.findInRange(any(),any())).thenReturn(new CalendarRangeResponse(List.of(),List.of(),List.of(),List.of(),List.of(),List.of()));
        service=new CalendarReviewService(db,current::get,calendar,work);
    }
    <T>T call(Supplier<T> fn){return tx.execute(status->fn.get());}
    WeeklyInput weekly(Long version){return new WeeklyInput(version,"한 줄",0,5,"종합\n회고","잘한 점","아쉬운 점","다음 주 방향");}
    @Test void missingReadsNeverCreateAndScoreZeroSurvives(){assertThat(service.daily(monday).version()).isEqualTo(-1);assertThat(service.weekly(monday)).isNull();assertThat(db.queryForObject("select count(*) from reflection_entries",Integer.class)).isZero();var w=call(()->service.saveWeekly(monday,weekly(-1L)));assertThat(w.score()).isZero();assertThat(w.strengths()).isEqualTo("잘한 점");assertThat(w.nextWeekDirection()).isEqualTo("다음 주 방향");}
    @Test void crossMonthSharesOneCanonicalMonday(){var first=call(()->service.saveWeekly(monday,weekly(-1L)));assertThat(service.range(monday,monday.plusDays(6)).weeks()).extracting(Weekly::id).containsExactly(first.id());assertThat(service.range(LocalDate.of(2026,10,1),LocalDate.of(2026,10,31)).weeks()).extracting(Weekly::id).containsExactly(first.id());assertThatThrownBy(()->call(()->service.saveWeekly(monday,weekly(-1L)))).isInstanceOf(OptimisticLockConflictException.class);assertThat(db.queryForObject("select count(*) from calendar_weekly_reviews",Integer.class)).isEqualTo(1);}
    @Test void nullableFieldsRemainMissingAndDeepFieldsAreIndependent(){call(()->service.saveWeekly(monday,weekly(-1L)));var w=call(()->service.saveWeekly(monday,new WeeklyInput(0L,"",null,null,"","","","")));assertThat(w.score()).isNull();assertThat(w.mood()).isNull();assertThat(w.version()).isEqualTo(1);assertThat(w.strengths()).isEmpty();assertThat(service.range(monday,monday.plusDays(6)).days()).allMatch(row->row.workMinutes()==null&&row.workScore()==null);}
    @Test void canonicalDailyAnnotationsProjectWithoutChangingNoteContentOrCompletedSnapshot(){db.update("insert into reflection_entries(id,user_id,entry_date,content,status,snapshot,title,day_score,mood_level,memo) values (?,?,?,'NOTE content','COMPLETED','{\"old\":true}'::jsonb,'하루 제목',0,1,'별도 주석 메모')",UUID.randomUUID(),alice,monday);var d=service.daily(monday);assertThat(d.memo()).isEqualTo("별도 주석 메모");assertThat(d.score()).isZero();assertThat(d.mood()).isEqualTo(1);assertThat(d.status()).isEqualTo("COMPLETED");assertThat(db.queryForObject("select content from reflection_entries",String.class)).isEqualTo("NOTE content");assertThat(db.queryForObject("select snapshot::text from reflection_entries",String.class)).contains("old");}
    @Test void ownerIsolationAppliesToEveryReadAndCasWrite(){call(()->service.saveWeekly(monday,weekly(-1L)));current.set(bob);assertThat(service.weekly(monday)).isNull();assertThat(service.daily(monday).version()).isEqualTo(-1);assertThat(service.range(monday,monday.plusDays(6)).weeks()).isEmpty();assertThatThrownBy(()->call(()->service.saveWeekly(monday,weekly(0L)))).isInstanceOf(OptimisticLockConflictException.class);call(()->service.saveWeekly(monday,weekly(-1L)));assertThat(db.queryForObject("select count(*) from calendar_weekly_reviews",Integer.class)).isEqualTo(2);}
    @Test void staleVersionsCannotClobberWeeklyFields(){call(()->service.saveWeekly(monday,weekly(-1L)));call(()->service.saveWeekly(monday,weekly(0L)));assertThatThrownBy(()->call(()->service.saveWeekly(monday,weekly(0L)))).isInstanceOf(OptimisticLockConflictException.class);assertThat(service.weekly(monday).version()).isEqualTo(1);}
    @Test void concurrentFirstCreationAndUpdatesHaveExactlyOneWinner() throws Exception{try(var pool=Executors.newFixedThreadPool(2)){var gate=new CountDownLatch(1);List<Future<Boolean>> results=new ArrayList<>();for(int i=0;i<2;i++)results.add(pool.submit(()->{gate.await();try{call(()->service.saveWeekly(monday,weekly(-1L)));return true;}catch(OptimisticLockConflictException expected){return false;}}));gate.countDown();assertThat(List.of(results.get(0).get(),results.get(1).get())).containsExactlyInAnyOrder(true,false);var updateGate=new CountDownLatch(1);results.clear();for(int i=0;i<2;i++)results.add(pool.submit(()->{updateGate.await();try{call(()->service.saveWeekly(monday,weekly(0L)));return true;}catch(OptimisticLockConflictException expected){return false;}}));updateGate.countDown();assertThat(List.of(results.get(0).get(),results.get(1).get())).containsExactlyInAnyOrder(true,false);}}
    @Test void invalidWeekScoreMoodTitleVersionAndRangeFailBeforeWriting(){for(LocalDate day:List.of(monday.plusDays(1),monday.plusDays(6)))assertThatThrownBy(()->call(()->service.saveWeekly(day,weekly(-1L)))).isInstanceOf(InvalidRequestException.class);for(Integer score:List.of(-1,101))assertThatThrownBy(()->call(()->service.saveWeekly(monday,new WeeklyInput(-1L,"",score,null,"","","","")))).isInstanceOf(InvalidRequestException.class);for(Integer mood:List.of(0,6))assertThatThrownBy(()->call(()->service.saveWeekly(monday,new WeeklyInput(-1L,"",null,mood,"","","","")))).isInstanceOf(InvalidRequestException.class);assertThatThrownBy(()->service.saveWeekly(monday,weekly(null))).isInstanceOf(InvalidRequestException.class);assertThatThrownBy(()->service.saveWeekly(monday,new WeeklyInput(-1L,"줄\n둘",null,null,"","","",""))).isInstanceOf(InvalidRequestException.class);assertThatThrownBy(()->service.range(monday,monday.plusDays(63))).isInstanceOf(InvalidRequestException.class);}
    @AfterEach void cleanup(){if(db!=null){db.execute("drop table calendar_weekly_reviews");db.execute("drop table reflection_entries");root.execute("drop schema "+schema);root.update("delete from auth.users where id in (?,?)",alice,bob);}}
}
