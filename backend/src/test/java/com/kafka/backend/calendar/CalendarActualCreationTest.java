package com.kafka.backend.calendar;

import com.kafka.backend.activitycategory.ActivityCategoryRepository;
import com.kafka.backend.common.*;
import com.kafka.backend.lifecategory.LifeCategoryRepository;
import com.kafka.backend.lifetime.*;
import com.kafka.backend.project.PhaseRepository;
import com.kafka.backend.supplementalwork.SupplementalWorkEntryRepository;
import com.kafka.backend.workrecord.WorkRecordRepository;
import com.kafka.backend.worktimeentry.WorkTimeEntryRepository;
import org.junit.jupiter.api.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Actual source validation and the durable operation receipt share real isolated SQL transactions. */
class CalendarActualCreationTest {
    UUID user=UUID.randomUUID();
    final LocalDate day=LocalDate.of(2026,7,13);
    JdbcTemplate db;DataSourceTransactionManager transactions;
    CurrentUserProvider users=mock(CurrentUserProvider.class);
    LifeTimeEntryRepository life=mock(LifeTimeEntryRepository.class);
    CalendarActualEditorService service;
    @BeforeEach void setup() {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000","sa","");
        db=new JdbcTemplate(ds);transactions=new DataSourceTransactionManager(ds);
        db.execute("create schema auth");db.execute("create table auth.users(id uuid primary key)");db.update("insert into auth.users values (?)",user);
        db.execute("create table calendar_creation_operations(user_id uuid,operation_id uuid,operation_kind varchar(80),response_json text,primary key(user_id,operation_id))");
        db.execute("create table life_time_entries(id uuid primary key,user_id uuid,entry_date date,title varchar,duration_minutes integer,start_at timestamp with time zone,end_at timestamp with time zone,memo varchar)");
        when(users.getCurrentUserId()).thenReturn(user);
        when(life.save(any())).thenAnswer(i->{LifeTimeEntry e=i.getArgument(0);db.update("insert into life_time_entries values (?,?,?,?,?,?,?,?)",e.getId(),e.getUserId(),e.getEntryDate(),e.getTitle(),e.getDurationMinutes(),e.getStartAt(),e.getEndAt(),e.getMemo());return e;});
        when(life.findByUserIdAndEntryDateBetweenOrderByEntryDateAscStartAtAsc(any(),any(),any())).thenAnswer(i->db.query(
            "select * from life_time_entries where user_id=? and entry_date between ? and ?",(rs,n)->read(rs),i.getArgument(0),i.getArgument(1),i.getArgument(2)));
        var records=mock(WorkRecordRepository.class);var work=mock(WorkTimeEntryRepository.class);var supplemental=mock(SupplementalWorkEntryRepository.class);
        var overlap=new ActualOverlapChecker(records,work,supplemental,life);ReflectionTestUtils.setField(overlap,"db",db);
        var target=new CalendarActualEditorService(work,supplemental,life,records,mock(ActivityCategoryRepository.class),mock(LifeCategoryRepository.class),users,overlap,mock(PhaseRepository.class));
        ReflectionTestUtils.setField(target,"creationOperations",proxy(new CalendarCreationOperations(db,users)));
        service=proxy(target);
    }
    @SuppressWarnings("unchecked") <T> T proxy(T target) {
        var proxy=new ProxyFactory(target);proxy.addAdvice(new TransactionInterceptor(transactions,new AnnotationTransactionAttributeSource()));return (T)proxy.getProxy();
    }
    LifeTimeEntry read(java.sql.ResultSet rs) throws java.sql.SQLException {
        var value=new LifeTimeEntry(rs.getObject("user_id",UUID.class),rs.getObject("entry_date",LocalDate.class),null,rs.getString("title"),rs.getInt("duration_minutes"),rs.getObject("start_at",OffsetDateTime.class),rs.getObject("end_at",OffsetDateTime.class),rs.getString("memo"));
        ReflectionTestUtils.setField(value,"id",rs.getObject("id",UUID.class));return value;
    }
    CalendarActualEditRequest request(String title,boolean scheduled) {
        return new CalendarActualEditRequest(day,null,title,30,scheduled?LocalTime.of(9,0):null,scheduled?LocalTime.of(9,30):null,"fixture",null);
    }
    CalendarActualEditorDto save(UUID key,String title,boolean scheduled){return service.create(ActualSourceType.LIFE_TIME_ENTRY,request(title,scheduled),key);}
    int count(){return db.queryForObject("select count(*) from life_time_entries",Integer.class);}
    @Test void lostResponseRetryKeepsOneActualAndUnscheduledDuration() {
        var key=UUID.randomUUID();var first=save(key,"Same",false);var second=save(key,"Same",false);
        assertThat(second).isEqualTo(first);assertThat(count()).isEqualTo(1);
        assertThat(db.queryForObject("select sum(duration_minutes) from life_time_entries",Integer.class)).isEqualTo(30);
    }
    List<Object> concurrent(String firstTitle,String secondTitle,UUID firstKey,UUID secondKey) throws Exception {
        var ready=new CountDownLatch(2);var start=new CountDownLatch(1);
        try(var threads=Executors.newFixedThreadPool(2)) {
            java.util.function.BiFunction<UUID,String,Callable<Object>> task=(key,title)->()->{
                ready.countDown();if(!start.await(5,TimeUnit.SECONDS))throw new IllegalStateException("Timed out");
                try {return save(key,title,true);}catch(InvalidRequestException conflict){return conflict;}
            };
            var first=threads.submit(task.apply(firstKey,firstTitle));var second=threads.submit(task.apply(secondKey,secondTitle));
            assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue();start.countDown();return List.of(first.get(5,TimeUnit.SECONDS),second.get(5,TimeUnit.SECONDS));
        }
    }
    @Test void concurrentDistinctOperationsWithIdenticalContentCreateTwoNormalActuals() throws Exception {
        var result=concurrent("Same","Same",UUID.randomUUID(),UUID.randomUUID());
        assertThat(result).allMatch(CalendarActualEditorDto.class::isInstance);
        assertThat(((CalendarActualEditorDto)result.get(0)).id()).isNotEqualTo(((CalendarActualEditorDto)result.get(1)).id());assertThat(count()).isEqualTo(2);
    }
    @Test void concurrentRepeatedOperationCreatesOnlyOneScheduledActual() throws Exception {
        var key=UUID.randomUUID();var result=concurrent("Same","Same",key,key);
        assertThat(result.get(0)).isEqualTo(result.get(1));assertThat(count()).isEqualTo(1);
    }
    @Test void concurrentNonidenticalConflictCommitsOneAndRejectsTheOther() throws Exception {
        var result=concurrent("One","Two",UUID.randomUUID(),UUID.randomUUID());
        assertThat(result.stream().filter(CalendarActualEditorDto.class::isInstance).count()).isEqualTo(1);
        assertThat(result.stream().filter(InvalidRequestException.class::isInstance).count()).isEqualTo(1);
        assertThat(count()).isEqualTo(1);
        assertThat(db.queryForObject("select count(*) from calendar_creation_operations",Integer.class)).isEqualTo(1);
    }
}
