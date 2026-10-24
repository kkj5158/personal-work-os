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
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V75__calendar_creation_operations.sql"),new ClassPathResource("db/migration/V91__calendar_timetables.sql"),new ClassPathResource("db/migration/V94__timetable_creation_groups.sql")).execute(ds);
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
    @Test void multiDayCreationGroupsPersistAndIndividualEditsDetach(){var t=create();var request=new CreateBlocks(List.of(1,3,5),b(1,600,60,null));var key=UUID.randomUUID();var first=call(()->service.createBlocks(t.id(),request,key));var repeat=call(()->service.createBlocks(t.id(),request,key));assertThat(repeat).isEqualTo(first);assertThat(call(()->service.blocks(t.id()))).hasSize(3);
        assertThat(first.blocks()).extracting(Block::creationGroupId).containsOnly(first.blocks().getFirst().creationGroupId()).doesNotContainNull();
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
    List<Block> group(Timetable t){return call(()->service.createBlocks(t.id(),new CreateBlocks(List.of(1,2,3,4,5),b(1,540,540,null)),UUID.randomUUID())).blocks();}
    UpdateGroup edit(List<Block> members,List<Integer> days,int length){return new UpdateGroup(days,new BlockInput(null,"알바",days.isEmpty()?1:days.getFirst(),540,length,"공통 메모",null),members.stream().map(b->new MemberVersion(b.id(),b.version())).toList());}
    Blocks save(Timetable t,List<Block> members,List<Integer> days,int length){return call(()->service.updateGroup(t.id(),members.getFirst().creationGroupId(),edit(members,days,length),UUID.randomUUID()));}
    @Test void groupReconcileKeepsIdsAndSingletonIdentityAndUnrelatedContent(){
        var t=create();var members=group(t);var standalone=add(t,3,540,540);var other=group(t);
        var request=edit(members,List.of(1,2,3,4,6),480);var key=UUID.randomUUID();var group=members.getFirst().creationGroupId();
        var result=call(()->service.updateGroup(t.id(),group,request,key));assertThat(call(()->service.updateGroup(t.id(),group,request,key))).isEqualTo(result);
        var changed=call(()->service.blocks(t.id())).stream().filter(b->group.equals(b.creationGroupId())).toList();
        assertThat(changed).extracting(Block::weekday).containsExactly(1,2,3,4,6);assertThat(changed).allMatch(b->b.durationMinutes()==480&&b.title().equals("알바")&&b.color()==null);
        for(var old:members)if(old.weekday()<5)assertThat(changed).anyMatch(b->b.id().equals(old.id())&&b.weekday()==old.weekday());
        assertThat(call(()->service.blocks(t.id()))).contains(standalone).containsAll(other);
        save(t,changed,List.of(3),60);var one=call(()->service.blocks(t.id())).stream().filter(b->group.equals(b.creationGroupId())).toList();
        assertThat(one).hasSize(1);save(t,one,List.of(3,7),480);assertThat(call(()->service.blocks(t.id())).stream().filter(b->group.equals(b.creationGroupId()))).hasSize(2);
    }
    @Test void groupConflictValidationAndMidTransactionFailureLeaveEverythingUntouched(){
        var t=create();var members=group(t);var before=call(()->service.blocks(t.id()));
        assertThatThrownBy(()->save(t,members,List.of(),60)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->save(t,members,List.of(1,1),60)).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->save(t,members,List.of(1),1441)).isInstanceOf(InvalidRequestException.class);
        var stale=new ArrayList<>(members.stream().map(b->new MemberVersion(b.id(),b.version())).toList());stale.set(4,new MemberVersion(members.get(4).id(),99L));
        assertThatThrownBy(()->call(()->service.updateGroup(t.id(),members.getFirst().creationGroupId(),new UpdateGroup(List.of(1,2,3,4,6),b(1,540,60,null),stale),UUID.randomUUID()))).isInstanceOf(OptimisticLockConflictException.class);
        db.execute("create function fail_tt_group() returns trigger language plpgsql as $$ begin if NEW.weekday=6 then raise exception 'synthetic group failure'; end if; return NEW; end $$");db.execute("create trigger fail_group before insert on calendar_timetable_blocks for each row execute function fail_tt_group()");
        UUID key=UUID.randomUUID();var request=edit(members,List.of(1,2,3,4,6),60);
        assertThatThrownBy(()->call(()->service.updateGroup(t.id(),members.getFirst().creationGroupId(),request,key))).isInstanceOf(RuntimeException.class);
        assertThat(call(()->service.blocks(t.id()))).isEqualTo(before);assertThat(db.queryForObject("select count(*) from calendar_creation_operations where operation_id=?",Integer.class,key)).isZero();
        db.execute("drop trigger fail_group on calendar_timetable_blocks");assertThat(call(()->service.updateGroup(t.id(),members.getFirst().creationGroupId(),request,key))).isNotNull();
    }
    @Test void groupBoundariesAndChangedMembershipAreCheckedBeforeWrites(){
        var t=create();var members=group(t);var other=create();var group=members.getFirst().creationGroupId();var request=edit(members,List.of(1,2),60);
        assertThatThrownBy(()->call(()->service.updateGroup(other.id(),group,request,UUID.randomUUID()))).isInstanceOf(ResourceNotFoundException.class);
        current.set(bob);assertThatThrownBy(()->call(()->service.updateGroup(t.id(),group,request,UUID.randomUUID()))).isInstanceOf(ResourceNotFoundException.class);current.set(alice);
        var moved=call(()->service.updateBlock(t.id(),members.getFirst().id(),b(7,1380,480,0L)));assertThat(moved.creationGroupId()).isNull();
        var before=call(()->service.blocks(t.id()));assertThatThrownBy(()->save(t,members,List.of(1,2,3),60)).isInstanceOf(OptimisticLockConflictException.class);assertThat(call(()->service.blocks(t.id()))).isEqualTo(before);
        var deleted=call(()->service.deleteBlock(t.id(),members.get(1).id(),new VersionInput(0L)));assertThat(deleted.creationGroupId()).isNull();
        assertThat(call(()->service.restoreBlock(t.id(),deleted.id(),new VersionInput(deleted.version()))).creationGroupId()).isNull();
        assertThat(call(()->service.blocks(t.id())).stream().filter(b->group.equals(b.creationGroupId()))).hasSize(3);
    }
    @Test void copyRemapsGroupsWhileSingleBlockCopyStaysUnlinkedAndOvernightStaysLogical(){
        var t=create();var members=call(()->service.createBlocks(t.id(),new CreateBlocks(List.of(1,7),b(7,1380,480,null)),UUID.randomUUID())).blocks();
        var single=add(t,7,1380,480);assertThat(single.creationGroupId()).isNull();
        var copy=call(()->service.duplicate(t.id(),new VersionInput(0L),UUID.randomUUID()));var copied=call(()->service.blocks(copy.id()));
        assertThat(copied).hasSize(3);var linked=copied.stream().filter(b->b.creationGroupId()!=null).toList();assertThat(linked).hasSize(2).allMatch(b->b.durationMinutes()==480);
        assertThat(linked.getFirst().creationGroupId()).isNotEqualTo(members.getFirst().creationGroupId());assertThat(linked).extracting(Block::creationGroupId).containsOnly(linked.getFirst().creationGroupId());
        save(copy,linked,List.of(7),60);assertThat(call(()->service.blocks(t.id()))).containsAll(members).contains(single);
    }
    @Test void concurrentGroupEditorsCommitOnceAndSameKeyReplaysOnce() throws Exception {
        var t=create();var members=group(t);var request=edit(members,List.of(1,2,3,4,6),480);var group=members.getFirst().creationGroupId();
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)){
            var ready=new java.util.concurrent.CyclicBarrier(2);
            java.util.concurrent.Callable<String> action=()->{ready.await();try{call(()->service.updateGroup(t.id(),group,request,UUID.randomUUID()));return "saved";}catch(OptimisticLockConflictException ex){return "conflict";}};
            var a=pool.submit(action);var b=pool.submit(action);assertThat(List.of(a.get(),b.get())).containsExactlyInAnyOrder("saved","conflict");
            var currentMembers=call(()->service.blocks(t.id()));var next=edit(currentMembers,List.of(1,7),60);UUID key=UUID.randomUUID();
            java.util.concurrent.Callable<Blocks> retry=()->{ready.await();return call(()->service.updateGroup(t.id(),group,next,key));};
            var first=pool.submit(retry);var second=pool.submit(retry);assertThat(first.get()).isEqualTo(second.get());
        }
        assertThat(call(()->service.blocks(t.id()))).hasSize(2);
    }
    @Test void migrationRecoversOnlyUntouchedOriginalReceiptMembersWithoutGuessing(){
        var t=create();var original=group(t);var standalone=add(t,1,540,540);var moved=call(()->service.updateBlock(t.id(),original.getFirst().id(),b(7,0,60,0L)));
        var copy=call(()->service.duplicate(t.id(),new VersionInput(0L),UUID.randomUUID()));
        // Recreate the exact pre-V94 receipt shape and schema in this owned test schema.
        db.update("update calendar_creation_operations set response_json=(jsonb_build_object('blocks',(select jsonb_agg(item-'creationGroupId') from jsonb_array_elements(response_json::jsonb->'blocks') item)))::text where response_json::jsonb ? 'blocks'");
        db.execute("alter table calendar_timetable_blocks drop column creation_group_id");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V94__timetable_creation_groups.sql")).execute(Objects.requireNonNull(db.getDataSource()));
        var recovered=call(()->service.blocks(t.id()));assertThat(recovered.stream().filter(b->b.creationGroupId()!=null)).hasSize(4);assertThat(recovered).contains(moved,standalone);
        assertThat(recovered).extracting(Block::id).containsAll(original.stream().map(Block::id).toList());assertThat(call(()->service.blocks(copy.id()))).allMatch(b->b.creationGroupId()==null);
    }
    GroupPlacement placement(List<Block> members,UUID anchor,int day,int start,int length){return new GroupPlacement(anchor,day,start,length,members.stream().map(b->new MemberVersion(b.id(),b.version())).toList());}
    @Test void groupDragResizeAndUndoKeepEveryIdentityAndOnlyChangePlacement(){
        var t=create();var original=group(t);var other=group(t);var single=add(t,1,540,540);var anchor=original.get(2);var group=anchor.creationGroupId();UUID key=UUID.randomUUID();
        var input=placement(original,anchor.id(),4,600,540);var first=call(()->service.placeGroup(t.id(),group,input,key));assertThat(call(()->service.placeGroup(t.id(),group,input,key))).isEqualTo(first);
        var moved=first.blocks().stream().filter(b->group.equals(b.creationGroupId())).toList();
        assertThat(moved).hasSize(5);for(var before:original){var after=moved.stream().filter(b->b.id().equals(before.id())).findFirst().orElseThrow();assertThat(after.weekday()).isEqualTo(before.weekday()+1);assertThat(after.startMinute()).isEqualTo(600);assertThat(after.durationMinutes()).isEqualTo(540);assertThat(after.version()).isEqualTo(1);assertThat(after.title()).isEqualTo(before.title());assertThat(after.memo()).isEqualTo(before.memo());assertThat(after.color()).isEqualTo(before.color());}
        assertThat(first.blocks()).contains(single).containsAll(other);
        var resized=call(()->service.placeGroup(t.id(),group,placement(moved,anchor.id(),4,600,600),UUID.randomUUID())).blocks().stream().filter(b->group.equals(b.creationGroupId())).toList();
        assertThat(resized).allMatch(b->b.durationMinutes()==600&&b.creationGroupId().equals(group));
        var undone=call(()->service.placeGroup(t.id(),group,placement(resized,anchor.id(),3,540,540),UUID.randomUUID())).blocks();
        for(var b:original)assertThat(undone).anyMatch(a->a.id().equals(b.id())&&a.weekday()==b.weekday()&&a.startMinute()==b.startMinute()&&a.durationMinutes()==b.durationMinutes()&&group.equals(a.creationGroupId()));
    }
    @Test void allSevenDaysAndOvernightWrapRotateWithoutUniqueIndexCollisions(){
        var t=create();var original=call(()->service.createBlocks(t.id(),new CreateBlocks(List.of(1,2,3,4,5,6,7),b(1,1380,480,null)),UUID.randomUUID())).blocks();var anchor=original.getLast();var group=anchor.creationGroupId();
        var moved=call(()->service.placeGroup(t.id(),group,placement(original,anchor.id(),1,30,480),UUID.randomUUID())).blocks();
        assertThat(moved).hasSize(7).allMatch(b->b.startMinute()==30&&b.durationMinutes()==480&&b.creationGroupId().equals(group));
        for(var b:original)assertThat(moved).anyMatch(a->a.id().equals(b.id())&&a.weekday()==b.weekday()%7+1);
        assertThat(call(()->service.placeGroup(t.id(),group,placement(moved,anchor.id(),7,1380,1440),UUID.randomUUID())).blocks()).hasSize(7).allMatch(b->b.startMinute()==1380&&b.durationMinutes()==1440);
    }
    @Test void placementValidationConflictsAndPartialFailureRollbackWholeGroup(){
        var t=create();var members=group(t);var anchor=members.getFirst();var group=anchor.creationGroupId();var before=call(()->service.blocks(t.id()));
        for(int length:List.of(0,1441))assertThatThrownBy(()->call(()->service.placeGroup(t.id(),group,placement(members,anchor.id(),2,600,length),UUID.randomUUID()))).isInstanceOf(InvalidRequestException.class);
        var stale=new ArrayList<>(members.stream().map(b->new MemberVersion(b.id(),b.version())).toList());stale.set(4,new MemberVersion(members.getLast().id(),99L));
        assertThatThrownBy(()->call(()->service.placeGroup(t.id(),group,new GroupPlacement(anchor.id(),2,600,60,stale),UUID.randomUUID()))).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(()->call(()->service.placeGroup(t.id(),group,placement(members.subList(0,4),anchor.id(),2,600,60),UUID.randomUUID()))).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(()->call(()->service.placeGroup(t.id(),group,placement(members,UUID.randomUUID(),2,600,60),UUID.randomUUID()))).isInstanceOf(ResourceNotFoundException.class);
        db.execute("create function fail_tt_placement() returns trigger language plpgsql as $$ begin if NEW.creation_group_id is not null and NEW.weekday=4 then raise exception 'synthetic placement failure'; end if; return NEW; end $$");db.execute("create trigger fail_placement before update on calendar_timetable_blocks for each row execute function fail_tt_placement()");
        UUID key=UUID.randomUUID();var input=placement(members,anchor.id(),2,600,60);assertThatThrownBy(()->call(()->service.placeGroup(t.id(),group,input,key))).isInstanceOf(RuntimeException.class);
        assertThat(call(()->service.blocks(t.id()))).isEqualTo(before);assertThat(db.queryForObject("select count(*) from calendar_creation_operations where operation_id=?",Integer.class,key)).isZero();
        db.execute("drop trigger fail_placement on calendar_timetable_blocks");assertThat(call(()->service.placeGroup(t.id(),group,input,key))).isNotNull();
    }
    @Test void placementRespectsOwnerParentArchiveAndStaleMembership(){
        var t=create();var members=group(t);var anchor=members.getFirst();var group=anchor.creationGroupId();var input=placement(members,anchor.id(),2,600,60);var other=create();
        assertThatThrownBy(()->call(()->service.placeGroup(other.id(),group,input,UUID.randomUUID()))).isInstanceOf(ResourceNotFoundException.class);
        current.set(bob);assertThatThrownBy(()->call(()->service.placeGroup(t.id(),group,input,UUID.randomUUID()))).isInstanceOf(ResourceNotFoundException.class);current.set(alice);
        call(()->service.archive(t.id(),new ArchiveInput(0L,true)));assertThatThrownBy(()->call(()->service.placeGroup(t.id(),group,input,UUID.randomUUID()))).isInstanceOf(InvalidRequestException.class);call(()->service.archive(t.id(),new ArchiveInput(1L,false)));
        call(()->service.deleteBlock(t.id(),members.getLast().id(),new VersionInput(0L)));var before=call(()->service.blocks(t.id()));assertThatThrownBy(()->call(()->service.placeGroup(t.id(),group,input,UUID.randomUUID()))).isInstanceOf(OptimisticLockConflictException.class);assertThat(call(()->service.blocks(t.id()))).isEqualTo(before);
    }
}
