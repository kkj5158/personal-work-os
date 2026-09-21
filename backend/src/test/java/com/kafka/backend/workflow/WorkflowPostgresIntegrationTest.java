package com.kafka.backend.workflow;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Explicit post-migration DEV check. Uses one transaction and rolls back all fixture data. */
@EnabledIfEnvironmentVariable(named="WORKFLOW_DEV_DB_TEST",matches="true")
class WorkflowPostgresIntegrationTest {
    SingleConnectionDataSource source;WorkflowService service;JdbcTemplate db;UUID user;
    @BeforeEach void connect()throws Exception {
        source=new SingleConnectionDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"),true);
        source.getConnection().setAutoCommit(false);
        db=new JdbcTemplate(source);user=UUID.fromString(System.getenv("APP_DEV_USER_ID"));
        assertThat(db.queryForObject("select count(*) from flyway_schema_history where version='38' and success",Long.class)).isEqualTo(1);
        service=new WorkflowService(db,()->user,JsonMapper.builder().build());
    }
    @AfterEach void rollback()throws Exception {if(source!=null){source.getConnection().rollback();source.destroy();}}
    @Test void postgresSharedTopicBacklinkAndFixedTabPersistence() {
        assertThat(db.queryForObject("select count(*) from flyway_schema_history where version in ('43','44') and success",Long.class)).isEqualTo(2);
        var notes=new WorklogNotesService(db,()->user);
        var note=notes.create(new WorklogNotesService.TopicInput("Worklog QA "+UUID.randomUUID(),"Original",0));
        assertThat(note.workspaceId()).isNull();
        var date=LocalDate.of(2098,10,1);var day=service.day(date);
        var block=new Block(UUID.randomUUID(),null,0,"TEXT","[["+note.title()+"]]",false,null,null,null,
            Map.of("wikiLinks",List.of(Map.of("name",note.title(),"ordinal",0,"noteId",note.id().toString()))));
        var blocks=new ArrayList<>(day.blocks());blocks.add(block);day=service.saveDay(date,new Day(date,day.revision(),blocks));
        notes.save(note.id(),new WorklogNotesService.TopicInput("Renamed "+note.title(),"Preserved",0));
        assertThat(notes.backlinks(note.id())).anyMatch(ref->ref.blockId().equals(block.id())&&ref.date().equals(date));
        service.saveDay(date,new Day(date,day.revision(),day.blocks().stream().filter(b->!b.id().equals(block.id())).toList()));
        assertThat(notes.backlinks(note.id())).isEmpty();assertThat(notes.get(note.id()).content()).isEqualTo("Preserved");
        // Existing five-tab owners are respected; avoid disturbing any user's tabs.
        if(service.fixedTabs().size()<5){
            var fixed=service.saveFixedTab(null,new WorkflowService.FixedTab(null,"QA reusable",0,List.of()));
            assertThat(service.fixedTab(fixed.id()).title()).isEqualTo("QA reusable");
        }
    }
    @Test void postgresHierarchyPromotionCarryPreferencesAndDatePersistence() {
        var date=LocalDate.of(2098,9,14);
        var p=service.saveProject(null,new Project(null,"Workflow QA "+UUID.randomUUID(),"ACTIVE",date,date.plusDays(5),"#123456","QA",6));
        var phase=service.savePhase(null,new Phase(null,p.id(),"Undated phase","TODO",null,null,"QA",2));
        var task=service.saveTask(null,new Task(null,"Task","TODO",p.id(),phase.id(),"HIGH",date.minusDays(1),date.plusDays(9),"QA",4));
        var day=service.addToday(task.id(),date);service.addToday(task.id(),date);
        assertThat(service.day(date).blocks()).filteredOn(b->task.id().equals(b.workTaskId())).hasSize(1);
        var local=new Block(UUID.randomUUID(),null,day.blocks().size(),"CHECKLIST","Promote QA",false,null,null,null,Map.of());
        var blocks=new ArrayList<>(day.blocks());blocks.add(local);service.saveDay(date,new Day(date,day.revision(),blocks));
        var promoted=service.promote(date,local.id());assertThat(service.promote(date,local.id()).id()).isEqualTo(promoted.id());
        var target=service.carry(date,new Carry(List.of(local.id()),date.plusDays(1)));
        assertThat(target.blocks()).anyMatch(b->promoted.id().equals(b.workTaskId())&&date.equals(b.sourceDate()));
        assertThat(service.task(task.id()).dueDate()).isEqualTo(date.plusDays(9));assertThat(service.phase(phase.id()).startDate()).isNull();
        service.preferences(Map.of("groupMode","PROJECT","projectOrder",List.of(p.id().toString())));
        assertThat(service.preferences().get("groupMode")).isEqualTo("PROJECT");
        service.deleteTask(task.id());service.deletePhase(phase.id());service.deleteProject(p.id());
    }
}
