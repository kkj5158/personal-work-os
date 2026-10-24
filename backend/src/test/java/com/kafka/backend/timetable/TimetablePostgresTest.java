package com.kafka.backend.timetable;

import com.kafka.backend.calendar.CalendarCreationOperations;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.core.io.ClassPathResource;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.timetable.TimetableTypes.*;

/** Real PostgreSQL and actual migrations, exclusively in a run-owned loopback cluster. */
@EnabledIfEnvironmentVariable(named="QA_TIMETABLE_PG_URL",matches="jdbc:postgresql://127\\.0\\.0\\.1:.*")
class TimetablePostgresTest {
    JdbcTemplate db; TransactionTemplate tx; TimetableService service;
    UUID alice=UUID.randomUUID(),bob=UUID.randomUUID();AtomicReference<UUID> current=new AtomicReference<>();
    @BeforeEach void setup(){
        String url=System.getenv("QA_TIMETABLE_PG_URL"),user=System.getenv("QA_TIMETABLE_PG_USERNAME");
        var root=new JdbcTemplate(new DriverManagerDataSource(url,user,""));
        String schema="tt_"+UUID.randomUUID().toString().replace("-","");root.execute("create schema "+schema);
        root.update("insert into auth.users(id) values (?),(?)",alice,bob);
        var ds=new DriverManagerDataSource(url+"?currentSchema="+schema,user,"");db=new JdbcTemplate(ds);tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V75__calendar_creation_operations.sql"),new ClassPathResource("db/migration/V91__calendar_timetables.sql")).execute(ds);
        current.set(alice);CurrentUserProvider provider=current::get;
        service=new TimetableService(db,provider,new CalendarCreationOperations(db,provider));
    }
    <T>T call(Supplier<T> fn){return tx.execute(status->fn.get());}
    Input input(String title,Long version){return new Input(version,title,"여러 줄\n설명","목표\n둘","메모", "#123abc",List.of(new CheckItem(UUID.randomUUID(),"회복 우선",true)));}
    Timetable create(){return call(()->service.create(input("생활",null),UUID.randomUUID()));}
    BlockInput b(int day,int start,int length,Long version){return new BlockInput(version,"수면",day,start,length,"블록 메모",null);}
    Block add(Timetable t,int day,int start,int length){return call(()->service.createBlocks(t.id(),new CreateBlocks(List.of(day),b(day,start,length,null)),UUID.randomUUID())).blocks().getFirst();}
    @Test void metadataPhilosophyAndBlocksRoundTripWithIndependentVersions(){
        var t=create();String content="# 운영 철학\n\n> 회복\n\n- [x] 체크\n\n**굵게** [링크](https://example.com)";
        call(()->service.savePhilosophy(t.id(),new PhilosophyInput(0L,content)));
        var updated=call(()->service.update(t.id(),input("변경",t.version())));
        assertThat(updated.description()).contains("\n");assertThat(updated.version()).isEqualTo(1);
        assertThat(call(()->service.philosophy(t.id())).content()).isEqualTo(content);
        assertThat(call(()->service.philosophy(t.id())).version()).isEqualTo(1);
        var block=add(t,7,1380,480);assertThat(call(()->service.blocks(t.id()))).containsExactly(block);
    }
    @Test void everyForeignPathIsHiddenAndCannotWrite(){
        var t=create();var block=add(t,1,1380,480);current.set(bob);
        List<Supplier<?>> attempts=List.of(()->service.get(t.id()),()->service.blocks(t.id()),()->service.philosophy(t.id()),
            ()->service.update(t.id(),input("침입",0L)),()->service.savePhilosophy(t.id(),new PhilosophyInput(0L,"침입")),
            ()->service.archive(t.id(),new ArchiveInput(0L,true)),()->service.duplicate(t.id(),new VersionInput(0L),UUID.randomUUID()),
            ()->service.createBlocks(t.id(),new CreateBlocks(List.of(1),b(1,0,60,null)),UUID.randomUUID()),
            ()->service.updateBlock(t.id(),block.id(),b(1,0,60,0L)),()->service.deleteBlock(t.id(),block.id(),new VersionInput(0L)),
            ()->service.restoreBlock(t.id(),block.id(),new VersionInput(0L)));
        for(var attempt:attempts)assertThatThrownBy(()->call(attempt)).isInstanceOf(ResourceNotFoundException.class);
        assertThat(call(()->service.list())).isEmpty();
        assertThatThrownBy(()->call(()->service.reorder(new ReorderInput(List.of(t.id()))))).isInstanceOf(InvalidRequestException.class);
        current.set(alice);var own=create();current.set(bob);
        assertThatThrownBy(()->call(()->service.updateBlock(own.id(),block.id(),b(1,0,60,0L)))).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void mismatchedBlockParentRejectedEvenForSameOwner(){var a=create();var b=create();var block=add(a,1,600,60);assertThatThrownBy(()->call(()->service.updateBlock(b.id(),block.id(),b(1,0,60,0L)))).isInstanceOf(ResourceNotFoundException.class);}
    @Test void explicitMidnightWeekBoundaryAndFullDayValidateOnServer(){var t=create();for(int day:List.of(1,7))assertThat(add(t,day,1380,480).durationMinutes()).isEqualTo(480);assertThat(add(t,2,541,1440).durationMinutes()).isEqualTo(1440);
        for(int bad:List.of(0,-1,1441,Integer.MAX_VALUE))assertThatThrownBy(()->add(t,1,0,bad)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->add(t,8,0,60)).isInstanceOf(InvalidRequestException.class);assertThatThrownBy(()->add(t,1,1440,60)).isInstanceOf(InvalidRequestException.class);
        assertThat(add(t,2,541,1).startMinute()).isEqualTo(541);
    }
    @Test void multiDayCreationIsIndependentAndDuplicateSafe(){var t=create();var request=new CreateBlocks(List.of(1,3,5),b(1,600,60,null));var key=UUID.randomUUID();var first=call(()->service.createBlocks(t.id(),request,key));var repeat=call(()->service.createBlocks(t.id(),request,key));assertThat(repeat).isEqualTo(first);assertThat(call(()->service.blocks(t.id()))).hasSize(3);
        var one=first.blocks().getFirst();call(()->service.updateBlock(t.id(),one.id(),b(7,0,30,0L)));assertThat(call(()->service.blocks(t.id())).stream().filter(x->x.startMinute()==600)).hasSize(2);
        assertThatThrownBy(()->call(()->service.createBlocks(t.id(),new CreateBlocks(List.of(2),b(2,600,60,null)),key))).isInstanceOf(InvalidRequestException.class);
    }
    @Test void fullCopyHasFreshIdentitiesAndIndependentContentsAndRetryReceipt(){var t=create();add(t,7,1380,480);call(()->service.savePhilosophy(t.id(),new PhilosophyInput(0L,"# 원칙")));UUID key=UUID.randomUUID();var copy=call(()->service.duplicate(t.id(),new VersionInput(t.version()),key));assertThat(call(()->service.duplicate(t.id(),new VersionInput(t.version()),key))).isEqualTo(copy);
        assertThat(copy.checklist().getFirst().id()).isNotEqualTo(t.checklist().getFirst().id());assertThat(copy.checklist().getFirst().checked()).isTrue();assertThat(copy.description()).isEqualTo(t.description());assertThat(call(()->service.blocks(copy.id())).getFirst().id()).isNotEqualTo(call(()->service.blocks(t.id())).getFirst().id());
        call(()->service.savePhilosophy(copy.id(),new PhilosophyInput(0L,"독립")));assertThat(call(()->service.philosophy(t.id())).content()).isEqualTo("# 원칙");assertThat(call(()->service.list())).hasSize(2);
    }
    @Test void copyFailureRollsBackParentBlocksAndReceipt(){var t=create();add(t,1,600,60);db.execute("create function fail_tt_copy() returns trigger language plpgsql as $$ begin raise exception 'synthetic copy failure'; end $$");db.execute("create trigger fail_copy before insert on calendar_timetable_blocks for each row execute function fail_tt_copy()");UUID key=UUID.randomUUID();assertThatThrownBy(()->call(()->service.duplicate(t.id(),new VersionInput(0L),key))).isInstanceOf(RuntimeException.class);
        assertThat(call(()->service.list())).hasSize(1);assertThat(db.queryForObject("select count(*) from calendar_creation_operations where operation_id=?",Integer.class,key)).isZero();
        db.execute("drop trigger fail_copy on calendar_timetable_blocks");assertThat(call(()->service.duplicate(t.id(),new VersionInput(0L),key))).isNotNull();
    }
    @Test void archiveRetainsIdentityAndRejectsAllContentWritesUntilRestored(){var t=create();var block=add(t,1,0,60);var archived=call(()->service.archive(t.id(),new ArchiveInput(0L,true)));assertThat(archived.archivedAt()).isNotNull();assertThat(call(()->service.get(t.id())).id()).isEqualTo(t.id());
        List<Supplier<?>> writes=List.of(()->service.update(t.id(),input("변경",1L)),()->service.savePhilosophy(t.id(),new PhilosophyInput(0L,"x")),()->service.deleteBlock(t.id(),block.id(),new VersionInput(0L)),()->service.duplicate(t.id(),new VersionInput(1L),UUID.randomUUID()));
        for(var fn:writes)assertThatThrownBy(()->call(fn)).isInstanceOf(InvalidRequestException.class);
        var restored=call(()->service.archive(t.id(),new ArchiveInput(1L,false)));assertThat(restored.archivedAt()).isNull();assertThat(call(()->service.blocks(t.id()))).hasSize(1);
    }
    @Test void optimisticConflictsPreserveServerAndDeleteUndoUsesSameId(){var t=create();call(()->service.update(t.id(),input("새 버전",0L)));assertThatThrownBy(()->call(()->service.update(t.id(),input("오래된 버전",0L)))).isInstanceOf(OptimisticLockConflictException.class);
        call(()->service.savePhilosophy(t.id(),new PhilosophyInput(0L,"새 원칙")));assertThatThrownBy(()->call(()->service.savePhilosophy(t.id(),new PhilosophyInput(0L,"오래된 원칙")))).isInstanceOf(OptimisticLockConflictException.class);
        var b=add(t,1,0,60);var moved=call(()->service.updateBlock(t.id(),b.id(),b(2,541,60,0L)));assertThatThrownBy(()->call(()->service.updateBlock(t.id(),b.id(),b(3,0,60,0L)))).isInstanceOf(OptimisticLockConflictException.class);
        var deleted=call(()->service.deleteBlock(t.id(),b.id(),new VersionInput(moved.version())));assertThat(call(()->service.blocks(t.id()))).isEmpty();assertThat(call(()->service.restoreBlock(t.id(),b.id(),new VersionInput(deleted.version()))).id()).isEqualTo(b.id());
    }
    @Test void reorderAndCreateReceiptAreOwnerScoped(){var input=input("새 시간표",null);UUID key=UUID.randomUUID();var a=call(()->service.create(input,key));assertThat(call(()->service.create(input,key))).isEqualTo(a);var b=create();var list=call(()->service.reorder(new ReorderInput(List.of(b.id(),a.id()))));assertThat(list).extracting(Timetable::id).containsExactly(b.id(),a.id());
        assertThatThrownBy(()->call(()->service.reorder(new ReorderInput(List.of(a.id(),a.id()))))).isInstanceOf(InvalidRequestException.class);current.set(bob);assertThat(call(()->service.create(input,key)).id()).isNotEqualTo(a.id());
    }
}
