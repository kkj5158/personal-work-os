package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Isolated SQL-backed tests; no shared database, migrations, or user data are mutated. */
class WorkflowServiceTest {
    SingleConnectionDataSource source;JdbcTemplate db;WorkflowService service;UUID user=UUID.randomUUID();
    LocalDate today=LocalDate.of(2026,9,14);
    @BeforeEach void setup()throws Exception {
        source=new SingleConnectionDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;NON_KEYWORDS=DAY","sa","",true);db=new JdbcTemplate(source);
        db.execute("create schema auth");db.execute("create table auth.users(id uuid primary key)");db.update("insert into auth.users values(?)",user);
        db.execute("create table journal_media(id uuid primary key,workspace_id uuid not null,mime_type varchar(40),width int,height int,data bytea)");
        for(String file:List.of("V26__create_projects_and_phases.sql","V38__work_flow_v1.sql")) {
            String sql=Files.readString(Path.of("src/main/resources/db/migration",file)).replaceAll("(?m)--.*$","").replace("TIMESTAMPTZ","TIMESTAMP WITH TIME ZONE");
            for(String statement:sql.split(";"))if(!statement.isBlank()&&!statement.contains("ENABLE ROW LEVEL SECURITY"))db.execute(statement);
        }
        for(String table:List.of("planned_time_blocks","work_time_entries","supplemental_work_entries"))db.execute("create table "+table+"(phase_id uuid)");
        db.execute("create table worklog_note_references(user_id uuid,day date,block_id uuid,normalized_name varchar,ordinal int,note_id uuid,excerpt text)");
        service=new WorkflowService(db,()->user,JsonMapper.builder().build());
    }
    @AfterEach void close(){source.destroy();}
    Project project(){return service.saveProject(null,new Project(null,"Project","ACTIVE",today,today.plusDays(4),"#123456","memo",3));}
    Phase phase(Project p){return service.savePhase(null,new Phase(null,p.id(),"Phase","TODO",null,null,"phase memo",2));}
    Task task(Project p,Phase ph){return service.saveTask(null,new Task(null,"Task","TODO",p==null?null:p.id(),ph==null?null:ph.id(),"HIGH",today.minusDays(2),today.plusDays(8),"task memo",4));}
    Block block(UUID parent,String type,String content,boolean checked,UUID task){return new Block(UUID.randomUUID(),parent,0,type,content,checked,task,null,null,Map.of());}
    Day save(Block... blocks){return service.saveDay(today,new Day(today,service.day(today).revision(),List.of(blocks)));}
    @Test void hierarchyCrudAndIndependentDatesPersist(){
        var p=project();var ph=phase(p);var t=task(p,ph);var direct=task(p,null);
        assertThat(service.all().tasks()).hasSize(2);assertThat(service.task(direct.id()).phaseId()).isNull();
        assertThat(service.task(t.id()).startDate()).isBefore(p.startDate());assertThat(service.project(p.id()).startDate()).isEqualTo(today);
        var moved=service.saveTask(t.id(),new Task(t.id(),"Edited","DOING",p.id(),null,"LOW",today,today.plusDays(2),"new memo",9));
        assertThat(moved.phaseId()).isNull();assertThat(moved.status()).isEqualTo("DOING");assertThat(moved.order()).isEqualTo(9);
        var updated=service.savePhase(ph.id(),new Phase(ph.id(),p.id(),"Phase edited","DONE",today,today,"memo",7));
        assertThat(updated.order()).isEqualTo(7);assertThat(service.task(t.id()).status()).isEqualTo("DOING");
        service.saveProject(p.id(),new Project(p.id(),p.title(),"DONE",today.plusDays(5),today.plusDays(9),p.color(),p.memo(),11));
        assertThat(service.task(t.id()).startDate()).isEqualTo(today);assertThat(service.phase(ph.id()).startDate()).isEqualTo(today);
        service.deleteTask(t.id());service.deleteTask(direct.id());service.deletePhase(ph.id());service.deleteProject(p.id());assertThat(service.all().projects()).isEmpty();
    }
    @Test void ownershipAndMismatchedHierarchyAreRejected(){
        var p=project();var ph=phase(p);var other=project();
        assertThatThrownBy(()->task(other,ph)).isInstanceOf(InvalidRequestException.class);
        UUID foreign=UUID.randomUUID();db.update("insert into auth.users values(?)",foreign);var outsider=new WorkflowService(db,()->foreign,JsonMapper.builder().build());
        assertThat(outsider.all().projects()).isEmpty();assertThatThrownBy(()->outsider.project(p.id())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->outsider.saveTask(null,new Task(null,"Illegal","TODO",p.id(),null,"NORMAL",null,null,null,0))).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void dayRoundTripsHierarchyAndRejectsStaleSave(){
        var parent=block(null,"BULLET","Parent",false,null);var child=block(parent.id(),"CHECKLIST","Child",false,null);var saved=save(parent,child);
        assertThat(saved.revision()).isEqualTo(1);assertThat(service.day(today).blocks()).extracting(Block::parentId).contains(parent.id());
        assertThatThrownBy(()->service.saveDay(today,new Day(today,0,List.of()))).isInstanceOf(OptimisticLockConflictException.class);
        var cycle=new Block(parent.id(),child.id(),0,"BULLET","",false,null,null,null,Map.of());
        assertThatThrownBy(()->save(cycle,child)).isInstanceOf(InvalidRequestException.class);assertThat(service.day(today).blocks()).hasSize(2);
    }
    @Test void promotionIsIdempotentAndKeepsChildrenAndUnlinkKeepsTask(){
        var b=block(null,"CHECKLIST","Ship feature",false,null);var note=block(b.id(),"TEXT","Details",false,null);save(b,note);
        var task=service.promote(today,b.id());assertThat(service.promote(today,b.id()).id()).isEqualTo(task.id());assertThat(service.all().tasks()).hasSize(1);
        assertThat(service.day(today).blocks()).extracting(Block::id).containsExactlyInAnyOrder(b.id(),note.id());
        service.unlink(today,b.id());assertThat(service.task(task.id())).isNotNull();assertThat(service.day(today).blocks()).filteredOn(x->x.id().equals(b.id())).allMatch(x->x.workTaskId()==null);
    }
    @Test void linkedStatusUsesTaskSourceOfTruthAndAddTodayDoesNotDuplicate(){
        var t=task(null,null);service.addToday(t.id(),today);service.addToday(t.id(),today);assertThat(service.day(today).blocks()).hasSize(1);
        service.saveTask(t.id(),new Task(t.id(),t.title(),"DONE",null,null,t.priority(),t.startDate(),t.dueDate(),t.memo(),t.order()));
        assertThat(service.day(today).blocks().getFirst().checked()).isTrue();
        var b=service.day(today).blocks().getFirst();save(new Block(b.id(),null,0,b.type(),b.content(),false,b.workTaskId(),null,null,Map.of()));
        assertThat(service.task(t.id()).status()).isEqualTo("DONE");assertThat(service.day(today).blocks().getFirst().checked()).isTrue();
        service.deleteTask(t.id());assertThat(service.day(today).blocks().getFirst().workTaskId()).isNull();assertThat(service.day(today).blocks().getFirst().checked()).isTrue();
    }
    @Test void carryCopiesIncompleteReferencesAndCompletedTextWithoutMovingSource(){
        var t=task(null,null);var local=block(null,"CHECKLIST","Local",false,null);var linked=block(null,"CHECKLIST","Linked",false,t.id());var done=block(null,"CHECKLIST","Done",true,null);save(local,linked,done);
        var carried=service.carry(today,new Carry(List.of(local.id(),linked.id(),done.id()),today.plusDays(1)));
        assertThat(carried.blocks()).hasSize(3);assertThat(service.day(today).blocks()).hasSize(3);assertThat(service.all().tasks()).hasSize(1);
        assertThat(carried.blocks()).anyMatch(b->t.id().equals(b.workTaskId()));assertThat(carried.blocks()).anyMatch(b->b.type().equals("TEXT")&&b.content().equals("Completed: Done")&&b.workTaskId()==null);
        assertThat(carried.blocks()).allMatch(b->b.sourceDate().equals(today)&&b.sourceBlockId()!=null);
    }
    @Test void childOnlyCarryIncludesAncestorsAsContextAndSelectedSubtree(){
        var root=block(null,"CHECKLIST","Root",false,null);var middle=block(root.id(),"CHECKLIST","Middle",false,null);var leaf=block(middle.id(),"CHECKLIST","Leaf",false,null);var note=block(leaf.id(),"TEXT","Note",false,null);save(root,middle,leaf,note);
        var copied=service.carry(today,new Carry(List.of(leaf.id()),today.plusDays(1))).blocks();
        assertThat(copied).hasSize(4);assertThat(copied).filteredOn(b->List.of("Root","Middle").contains(b.content())).allMatch(b->b.type().equals("TEXT")&&b.workTaskId()==null);
        var copiedLeaf=copied.stream().filter(b->b.content().equals("Leaf")).findFirst().orElseThrow();assertThat(copiedLeaf.type()).isEqualTo("CHECKLIST");assertThat(copied).anyMatch(b->b.content().equals("Note")&&b.parentId().equals(copiedLeaf.id()));
    }
    @Test void imageGroupMetadataSurvivesSaveAndCarryAndRejectsForeignImage(){
        UUID image=UUID.randomUUID();db.update("insert into journal_media(id,workflow_owner_id,mime_type,width,height,data) values(?,?,?,?,?,?)",image,user,"image/png",1,1,new byte[]{1});
        var metadata=Map.<String,Object>of("images",List.of(Map.of("id",image.toString(),"width",120,"caption","Evidence")),"columns",2);
        var group=new Block(UUID.randomUUID(),null,0,"IMAGE_GROUP","",false,null,null,null,metadata);save(group);
        assertThat(service.carry(today,new Carry(List.of(group.id()),today.plusDays(1))).blocks().getFirst().metadata()).isEqualTo(metadata);
        var bad=new Block(UUID.randomUUID(),null,0,"IMAGE","",false,null,null,null,Map.of("images",List.of(Map.of("id",UUID.randomUUID().toString()))));
        assertThatThrownBy(()->save(bad)).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void preferencesPersistIndependentlyFromDomainOrder(){
        var a=project();var b=project();var prefs=Map.<String,Object>of("groupMode","PROJECT","projectOrder",List.of(b.id().toString(),a.id().toString()),"showCompleted",false,"rememberCollapse",true);
        service.preferences(prefs);assertThat(service.preferences()).isEqualTo(prefs);assertThat(service.project(a.id()).order()).isEqualTo(3);
    }
    @Test void foreignTaskAndSourceReferencesCannotBeStored(){
        var task=task(null,null);UUID foreign=UUID.randomUUID();db.update("insert into auth.users values(?)",foreign);var outsider=new WorkflowService(db,()->foreign,JsonMapper.builder().build());
        assertThatThrownBy(()->outsider.saveDay(today,new Day(today,0,List.of(block(null,"CHECKLIST","Foreign",false,task.id()))))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->save(new Block(UUID.randomUUID(),null,0,"TEXT","Forged",false,null,UUID.randomUUID(),today.minusDays(1),Map.of()))).isInstanceOf(InvalidRequestException.class);
    }
    Move moveRequest(Day source, LocalDate target, boolean incompleteOnly, UUID... ids) {
        return new Move(List.of(ids), target, source.revision(), service.day(target).revision(), incompleteOnly);
    }
    @Test void movePreservesSelectedSubtreeIdentityCompletionAndTaskAndUndoRestoresBothDays() {
        var task=task(null,null);
        var heading=block(null,"H2","Project",false,null);
        var linked=block(heading.id(),"CHECKLIST","Linked",false,task.id());
        var done=block(heading.id(),"CHECKLIST","Done",true,null);
        var source=save(heading,linked,done);
        LocalDate destination=today.plusDays(8);
        var targetBlock=block(null,"TEXT","Existing",false,null);
        var target=service.saveDay(destination,new Day(destination,0,List.of(targetBlock)));
        var moved=service.move(today,moveRequest(source,destination,false,heading.id()));
        assertThat(moved.source().blocks()).isEmpty();
        assertThat(moved.target().blocks()).extracting(Block::id).containsExactlyInAnyOrder(heading.id(),linked.id(),done.id(),targetBlock.id());
        assertThat(moved.target().blocks()).anyMatch(b->b.id().equals(done.id())&&b.checked()&&b.type().equals("CHECKLIST"));
        assertThat(moved.target().blocks()).anyMatch(b->b.id().equals(linked.id())&&task.id().equals(b.workTaskId()));
        assertThat(moved.target().blocks()).filteredOn(b->b.id().equals(heading.id())).allMatch(b->b.metadata().containsKey("moveHistory"));
        assertThat(moved.source().revision()).isEqualTo(source.revision()+1);
        assertThat(moved.target().revision()).isEqualTo(target.revision()+1);
        var restored=service.undoMove(moved.undoToken());
        assertThat(restored.source().blocks()).containsExactlyElementsOf(source.blocks());
        assertThat(restored.target().blocks()).containsExactlyElementsOf(target.blocks());
        assertThat(restored.source().revision()).isEqualTo(source.revision()+2);
        assertThatThrownBy(()->service.undoMove(moved.undoToken())).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void childMoveClonesContextAndRepeatedMovesReuseEquivalentTargetHeading() {
        var heading=block(null,"H2","Project",false,null);
        var first=block(heading.id(),"CHECKLIST","First",false,null);
        var second=block(heading.id(),"CHECKLIST","Second",false,null);
        var source=save(heading,first,second);
        var destination=today.plusDays(1);
        var moved=service.move(today,moveRequest(source,destination,false,first.id()));
        assertThat(moved.source().blocks()).extracting(Block::id).containsExactlyInAnyOrder(heading.id(),second.id());
        var context=moved.target().blocks().stream().filter(b->b.type().equals("H2")).findFirst().orElseThrow();
        assertThat(context.id()).isNotEqualTo(heading.id());
        assertThat(context.sourceBlockId()).isEqualTo(heading.id());
        var movedAgain=service.move(today,moveRequest(moved.source(),destination,false,second.id()));
        assertThat(movedAgain.target().blocks()).hasSize(3);
        assertThat(movedAgain.target().blocks()).filteredOn(b->b.type().equals("CHECKLIST")).allMatch(b->context.id().equals(b.parentId()));
    }
    @Test void automaticCarryExcludesCompletedDescendantsAndKeepsTheirSourceContext() {
        var parent=block(null,"CHECKLIST","Incomplete parent",false,null);
        var done=block(parent.id(),"CHECKLIST","Completed child",true,null);
        var pending=block(parent.id(),"CHECKLIST","Pending child",false,null);
        var source=save(parent,done,pending);
        var moved=service.move(today,moveRequest(source,today.plusDays(1),true,parent.id()));
        assertThat(moved.movedBlockIds()).containsExactlyInAnyOrder(parent.id(),pending.id());
        assertThat(moved.target().blocks()).extracting(Block::id).doesNotContain(done.id());
        assertThat(moved.source().blocks()).anyMatch(b->b.id().equals(done.id())&&b.checked());
        assertThat(moved.source().blocks()).anyMatch(b->b.type().equals("TEXT")&&b.content().equals(parent.content())&&!b.id().equals(parent.id()));
        WorkflowService.validateBlocks(moved.source().blocks());
    }
    @Test void moveRequiresBothCurrentRevisionsAndUndoCannotOverwriteNewerEdits() {
        var local=block(null,"TEXT","Keep me",false,null);
        var source=save(local);var destination=today.plusDays(1);
        assertThatThrownBy(()->service.move(today,new Move(List.of(local.id()),destination,null,0L,false))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.move(today,new Move(List.of(local.id()),destination,0L,0L,false))).isInstanceOf(OptimisticLockConflictException.class);
        assertThatThrownBy(()->service.move(today,new Move(List.of(local.id()),destination,source.revision(),1L,false))).isInstanceOf(OptimisticLockConflictException.class);
        assertThat(service.day(today).blocks()).containsExactly(local);
        var moved=service.move(today,moveRequest(source,destination,false,local.id()));
        service.saveDay(destination,new Day(destination,moved.target().revision(),moved.target().blocks()));
        assertThatThrownBy(()->service.undoMove(moved.undoToken())).isInstanceOf(OptimisticLockConflictException.class);
        assertThat(service.day(destination).blocks()).extracting(Block::id).containsExactly(local.id());
        assertThat(service.day(today).blocks()).isEmpty();
    }
    @Test void destinationFailureRollsBackBothDaysAndRevisions() {
        var local=block(null,"TEXT","Reject destination",false,null);
        var source=save(local);var destination=today.plusDays(1);
        db.execute("alter table workpad_blocks add constraint reject_move_test check (day <> DATE '"+destination+"' or content <> 'Reject destination')");
        var transaction=new TransactionTemplate(new DataSourceTransactionManager(this.source));
        assertThatThrownBy(()->transaction.execute(status->service.move(today,moveRequest(source,destination,false,local.id()))))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertThat(service.day(today)).isEqualTo(source);
        assertThat(service.day(destination).blocks()).isEmpty();
        assertThat(service.day(destination).revision()).isZero();
    }
    @Test void moveAndUndoSynchronizeWikiBacklinksWithoutChangingNoteIdentity() {
        db.execute("create table note_workspaces(id uuid primary key,owner_id uuid)");
        db.execute("create table journal_notes(id uuid primary key,workspace_id uuid,workflow_owner_id uuid)");
        UUID note=UUID.randomUUID();
        db.update("insert into journal_notes(id,workflow_owner_id) values(?,?)",note,user);
        var metadata=Map.<String,Object>of("wikiLinks",List.of(Map.of("name","Shared NOTE","ordinal",0,"noteId",note.toString())));
        var block=new Block(UUID.randomUUID(),null,0,"TEXT","Read [[Shared NOTE]]",false,null,null,null,metadata);
        var source=save(block);var destination=today.plusDays(4);
        var transaction=new TransactionTemplate(new DataSourceTransactionManager(this.source));
        var moved=transaction.execute(status->service.move(today,moveRequest(source,destination,false,block.id())));
        assertThat(db.queryForList("select day from worklog_note_references where note_id=?",java.sql.Date.class,note))
            .containsExactly(java.sql.Date.valueOf(destination));
        assertThat(moved.target().blocks().getFirst().metadata().get("wikiLinks")).isEqualTo(metadata.get("wikiLinks"));
        transaction.execute(status->service.undoMove(moved.undoToken()));
        assertThat(db.queryForList("select day from worklog_note_references where note_id=?",java.sql.Date.class,note))
            .containsExactly(java.sql.Date.valueOf(today));
    }
}
