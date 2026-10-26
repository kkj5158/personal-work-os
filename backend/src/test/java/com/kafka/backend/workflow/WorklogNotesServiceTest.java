package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;
import static com.kafka.backend.workflow.WorklogNotesService.*;

class WorklogNotesServiceTest {
    SingleConnectionDataSource source;JdbcTemplate db;WorklogNotesService notes;WorkflowService workflow;
    UUID owner=UUID.randomUUID(),other=UUID.randomUUID(),workspace=UUID.randomUUID();
    AtomicReference<UUID> current=new AtomicReference<>(owner);
    LocalDate date=LocalDate.of(2026,9,20);
    @BeforeEach void setup()throws Exception {
        source=new SingleConnectionDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;NON_KEYWORDS=DAY","sa","",true);db=new JdbcTemplate(source);
        db.execute("create schema auth");db.execute("create table auth.users(id uuid primary key)");db.update("insert into auth.users values(?),(?)",owner,other);
        db.execute("create table note_workspaces(id uuid primary key,owner_id uuid,name varchar)");db.update("insert into note_workspaces values(?,?,?)",workspace,owner,"Existing Workspace");
        db.execute("create table journal_notes(id uuid primary key,workspace_id uuid not null references note_workspaces(id),type varchar,title varchar,content text default '',version bigint default 0,deleted_at timestamp,updated_at timestamp default current_timestamp)");
        db.execute("create table journal_media(id uuid primary key,workspace_id uuid not null,mime_type varchar,width int,height int,data bytea)");
        for(String name:List.of("V26__create_projects_and_phases.sql","V38__work_flow_v1.sql","V43__worklog_note_context.sql","V44__fixed_workflow_tabs.sql")){
            String sql=Files.readString(Path.of("src/main/resources/db/migration",name)).replaceAll("(?m)--.*$","").replace("TIMESTAMPTZ","TIMESTAMP WITH TIME ZONE");
            for(String statement:sql.split(";"))if(!statement.isBlank()&&!statement.contains("ENABLE ROW LEVEL SECURITY"))db.execute(statement);
        }
        notes=new WorklogNotesService(db,current::get);workflow=new WorkflowService(db,current::get,JsonMapper.builder().build());
    }
    @AfterEach void close(){source.destroy();}
    Topic create(String title){return notes.create(new TopicInput(title,"original content",0));}
    Block linked(UUID note,String name){return new Block(UUID.randomUUID(),null,0,"TEXT","Discuss [["+name+"]]",false,null,null,null,Map.of("wikiLinks",List.of(Map.of("name",name,"ordinal",0,"noteId",note.toString()))));}
    @Test void contextUsesCurrentParentTreeAndKeepsDistinctOccurrencesAndSiblingBoundaries(){
        var note=create("Planning");var first=linked(note.id(),"Planning");var second=linked(note.id(),"Planning");
        var child=new Block(UUID.randomUUID(),first.id(),0,"CHECKLIST","Child",true,null,null,null,Map.of("strike",true));
        var grandchild=new Block(UUID.randomUUID(),child.id(),0,"BULLET","Grandchild",false,null,null,null,Map.of());
        var sibling=new Block(UUID.randomUUID(),null,1,"TEXT","Unrelated sibling",false,null,null,null,Map.of());
        var day=workflow.saveDay(date,new Day(date,0,List.of(first,child,grandchild,sibling,second)));
        assertThat(notes.backlinks(note.id())).hasSize(2);
        var context=notes.backlinkContext(note.id(),date,first.id(),0);
        assertThat(context.blocks()).extracting(row->row.block().id()).containsExactly(first.id(),child.id(),grandchild.id());
        assertThat(context.blocks()).extracting(ContextBlock::depth).containsExactly(0,1,2);
        assertThat(context.blocks().get(1).block().checked()).isTrue();
        assertThat(notes.backlinkContext(note.id(),date,second.id(),0).blocks()).hasSize(1);
        var moved=new Block(child.id(),null,4,"CHECKLIST","Edited child",false,null,null,null,child.metadata());
        workflow.saveDay(date,new Day(date,day.revision(),List.of(first,moved,grandchild,sibling,second)));
        assertThat(notes.backlinkContext(note.id(),date,first.id(),0).blocks()).hasSize(1);
        current.set(other);
        assertThatThrownBy(()->notes.backlinkContext(note.id(),date,first.id(),0)).isInstanceOf(ResourceNotFoundException.class);
        current.set(owner);
        assertThatThrownBy(()->notes.backlinkContext(note.id(),date,sibling.id(),0)).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void historyAndContextArePagedAndEveryBlockRemainsAccessible(){
        var note=create("Planning");List<Block> blocks=new ArrayList<>();
        for(int n=0;n<51;n++)blocks.add(linked(note.id(),"Planning"));
        var root=blocks.getFirst();
        for(int n=0;n<105;n++)blocks.add(new Block(UUID.randomUUID(),root.id(),n,"BULLET","Child "+n,false,null,null,null,Map.of()));
        workflow.saveDay(date,new Day(date,0,blocks));
        assertThat(notes.backlinks(note.id())).hasSize(50);assertThat(notes.backlinks(note.id(),50)).hasSize(1);
        assertThat(notes.backlinkContext(note.id(),date,root.id(),0).blocks()).hasSize(100);
        assertThat(notes.backlinkContext(note.id(),date,root.id(),100).blocks()).hasSize(6);
        assertThat(notes.backlinkContext(note.id(),date,root.id(),0).total()).isEqualTo(106);
        assertThatThrownBy(()->notes.backlinks(note.id(),-1)).isInstanceOf(InvalidRequestException.class);
    }
    @Test void migrationPreservesWorkspaceWritesAndAllowsIndependentTopicIdentity(){
        UUID legacy=UUID.randomUUID();db.update("insert into journal_notes(id,workspace_id,type,title,content) values(?,?,'NOTE','Shared title','legacy content')",legacy,workspace);
        var topic=create("Shared title");assertThat(topic.workspaceId()).isNull();assertThat(topic.scope()).isEqualTo("WORK FLOW");
        assertThat(notes.search("Shared")).extracting(Topic::id).containsExactlyInAnyOrder(legacy,topic.id());
        assertThat(notes.get(legacy).content()).isEqualTo("legacy content");assertThat(notes.get(legacy).workspaceId()).isEqualTo(workspace);
        assertThatThrownBy(()->notes.save(legacy,new TopicInput("Changed","",0))).isInstanceOf(InvalidRequestException.class);
    }
    @Test void backlinksSurviveRenameReorderAndOnlyRelationIsRemoved(){
        var topic=create("Planning");var block=linked(topic.id(),"Planning");
        var day=workflow.saveDay(date,new Day(date,0,List.of(block)));assertThat(notes.backlinks(topic.id())).hasSize(1);
        var renamed=notes.save(topic.id(),new TopicInput("Renamed","new content",0));assertThat(renamed.id()).isEqualTo(topic.id());
        var extra=new Block(UUID.randomUUID(),null,0,"TEXT","Above",false,null,null,null,Map.of());
        day=workflow.saveDay(date,new Day(date,day.revision(),List.of(extra,block)));
        assertThat(notes.backlinks(topic.id()).getFirst().blockId()).isEqualTo(block.id());assertThat(notes.backlinks(topic.id()).getFirst().date()).isEqualTo(date);
        var removed=new Block(block.id(),null,1,"TEXT","Discuss later",false,null,null,null,block.metadata());
        workflow.saveDay(date,new Day(date,day.revision(),List.of(extra,removed)));assertThat(notes.backlinks(topic.id())).isEmpty();assertThat(notes.get(topic.id()).content()).isEqualTo("new content");
        assertThatThrownBy(()->notes.save(topic.id(),new TopicInput("Stale","bad",0))).isInstanceOf(OptimisticLockConflictException.class);
    }
    @Test void unresolvedNamesNeverBindAndCrossOwnerIdsAreRejected(){
        var topic=create("Exact");var unresolved=new Block(UUID.randomUUID(),null,0,"TEXT","[[Exact]]",false,null,null,null,Map.of());
        workflow.saveDay(date,new Day(date,0,List.of(unresolved)));assertThat(notes.backlinks(topic.id())).isEmpty();
        current.set(other);assertThat(notes.search("Exact")).isEmpty();assertThatThrownBy(()->notes.get(topic.id())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->notes.backlinks(topic.id())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->workflow.saveDay(date,new Day(date,0,List.of(linked(topic.id(),"Exact"))))).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void fixedTabsAreIndependentLimitedAndRevisionProtected(){
        var check=new Block(UUID.randomUUID(),null,0,"CHECKLIST","Reusable",true,null,null,null,Map.of());
        var fixed=workflow.saveFixedTab(null,new WorkflowService.FixedTab(null,"Routine",0,List.of(check)));
        assertThat(workflow.day(date).blocks()).isEmpty();assertThat(workflow.fixedTab(fixed.id()).blocks().getFirst().checked()).isTrue();
        workflow.saveFixedTab(fixed.id(),new WorkflowService.FixedTab(fixed.id(),"Renamed routine",0,List.of(check)));
        assertThatThrownBy(()->workflow.saveFixedTab(fixed.id(),fixed)).isInstanceOf(OptimisticLockConflictException.class);
        for(int i=0;i<4;i++)workflow.saveFixedTab(null,new WorkflowService.FixedTab(null,"Routine "+i,0,List.of()));
        assertThatThrownBy(()->workflow.saveFixedTab(null,new WorkflowService.FixedTab(null,"Six",0,List.of()))).isInstanceOf(InvalidRequestException.class);
        current.set(other);assertThat(workflow.fixedTabs()).isEmpty();assertThatThrownBy(()->workflow.fixedTab(fixed.id())).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void resolveRepeatedNormalizedTitleKeepsOneCanonicalIdentityWithoutWorkspace(){
        var first=notes.resolve("  Ｏutlier   Plan  ").getFirst();
        var again=notes.resolve("outlier plan");
        assertThat(again).extracting(Topic::id).containsExactly(first.id());
        assertThat(first.workspaceId()).isNull();assertThat(first.scope()).isEqualTo("WORK FLOW");
        assertThat(first.content()).isEmpty();assertThat(first.version()).isZero();
        assertThat(db.queryForObject("select workflow_owner_id from journal_notes where id=?",UUID.class,first.id())).isEqualTo(owner);
        assertThat(db.queryForObject("select count(*) from journal_notes",Long.class)).isEqualTo(1L);
        assertThat(db.queryForObject("select count(*) from note_workspaces",Long.class)).isEqualTo(1L);
    }
    @Test void resolveExistingWorkspaceNoteReturnsItsCanonicalIdentityAndContent(){
        UUID legacy=UUID.randomUUID();
        db.update("insert into journal_notes(id,workspace_id,type,title,content) values(?,?,'NOTE','Outlier  Plan','existing body')",legacy,workspace);
        var matches=notes.resolve("OUTLIER plan");
        assertThat(matches).hasSize(1);assertThat(matches.getFirst().id()).isEqualTo(legacy);
        assertThat(matches.getFirst().workspaceId()).isEqualTo(workspace);
        assertThat(matches.getFirst().content()).isEqualTo("existing body");
        assertThat(db.queryForObject("select count(*) from journal_notes",Long.class)).isEqualTo(1L);
    }
    @Test void resolveAmbiguousTitleReturnsChoicesWithoutCreatingOrGuessing(){
        UUID legacy=UUID.randomUUID();
        db.update("insert into journal_notes(id,workspace_id,type,title) values(?,?,'NOTE','Planning')",legacy,workspace);
        var independent=create("PLANNING");
        assertThat(notes.resolve("planning")).extracting(Topic::id).containsExactlyInAnyOrder(legacy,independent.id());
        assertThat(db.queryForObject("select count(*) from journal_notes",Long.class)).isEqualTo(2L);
    }
    @Test void resolveNeverExposesAnotherOwnersMatchingNote(){
        var privateTopic=create("Private topic");
        UUID legacy=UUID.randomUUID();
        db.update("insert into journal_notes(id,workspace_id,type,title) values(?,?,'NOTE','Private topic')",legacy,workspace);
        current.set(other);
        var own=notes.resolve("Private topic").getFirst();
        assertThat(own.id()).isNotEqualTo(privateTopic.id()).isNotEqualTo(legacy);
        assertThat(notes.resolve("PRIVATE TOPIC")).extracting(Topic::id).containsExactly(own.id());
        assertThat(notes.search("Private topic")).extracting(Topic::id).containsExactly(own.id());
        assertThatThrownBy(()->notes.get(privateTopic.id())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(()->notes.get(legacy)).isInstanceOf(ResourceNotFoundException.class);
        current.set(owner);
        assertThatThrownBy(()->notes.get(own.id())).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void resolveDeletedTitleCreatesNewCanonicalNoteWithoutResurrectingOldLinks(){
        var old=create("Planning");var block=linked(old.id(),"Planning");
        var day=workflow.saveDay(date,new Day(date,0,List.of(block)));
        db.update("update journal_notes set deleted_at=current_timestamp where id=?",old.id());
        var replacement=notes.resolve("Planning").getFirst();
        assertThat(replacement.id()).isNotEqualTo(old.id());assertThat(replacement.workspaceId()).isNull();
        assertThat(notes.backlinks(replacement.id())).isEmpty();
        assertThatThrownBy(()->notes.backlinks(old.id())).isInstanceOf(ResourceNotFoundException.class);
        // Historical metadata may remain while unrelated edits are saved.
        day=workflow.saveDay(date,new Day(date,day.revision(),List.of(block)));
        var relinked=new Block(block.id(),null,0,"TEXT",block.content(),false,null,null,null,
            Map.of("wikiLinks",List.of(Map.of("name","Planning","ordinal",0,"noteId",replacement.id().toString()))));
        workflow.saveDay(date,new Day(date,day.revision(),List.of(relinked)));
        assertThat(notes.backlinks(replacement.id())).extracting(Backlink::blockId).containsExactly(block.id());
        assertThat(db.queryForObject("select count(*) from worklog_note_references where note_id=?",Long.class,old.id())).isZero();
        assertThat(db.queryForObject("select count(*) from journal_notes where id=? and deleted_at is not null",Long.class,old.id())).isEqualTo(1L);
    }
    @Test void repeatedLinksAndRepeatedSavesProduceOneBacklinkPerSourceBlockAndRemovalClearsIt(){
        var topic=create("Planning");UUID blockId=UUID.randomUUID();
        var repeated=new Block(blockId,null,0,"TEXT","[[Planning]] then [[Planning]]",false,null,null,null,
            Map.of("wikiLinks",List.of(
                Map.of("name","Planning","ordinal",0,"noteId",topic.id().toString()),
                Map.of("name","Planning","ordinal",1,"noteId",topic.id().toString()))));
        var day=workflow.saveDay(date,new Day(date,0,List.of(repeated)));
        day=workflow.saveDay(date,new Day(date,day.revision(),List.of(repeated)));
        assertThat(notes.backlinks(topic.id())).hasSize(1);
        assertThat(notes.backlinks(topic.id()).getFirst().blockId()).isEqualTo(blockId);
        var later=linked(topic.id(),"Planning");
        workflow.saveDay(date.plusDays(1),new Day(date.plusDays(1),0,List.of(later)));
        assertThat(notes.backlinks(topic.id())).extracting(Backlink::date).containsExactly(date.plusDays(1),date);
        var removed=new Block(blockId,null,0,"TEXT","No links remain",false,null,null,null,repeated.metadata());
        workflow.saveDay(date,new Day(date,day.revision(),List.of(removed)));
        assertThat(notes.backlinks(topic.id())).extracting(Backlink::blockId).containsExactly(later.id());
        workflow.saveDay(date.plusDays(1),new Day(date.plusDays(1),workflow.day(date.plusDays(1)).revision(),List.of()));
        assertThat(notes.backlinks(topic.id())).isEmpty();assertThat(notes.get(topic.id()).content()).isEqualTo("original content");
    }
}
