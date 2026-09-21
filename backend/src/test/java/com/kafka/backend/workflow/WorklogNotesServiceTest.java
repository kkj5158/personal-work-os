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
}
