package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.workflow.WorkflowTypes.*;

/** Same tests run against isolated H2 or the task-owned loopback PostgreSQL database. */
class WorkRoutineTest {
    SingleConnectionDataSource source;JdbcTemplate db;WorkflowService service;
    UUID owner=UUID.randomUUID(),other=UUID.randomUUID();String schema;
    @BeforeEach void setup()throws Exception {
        String url=System.getenv("WORK_ROUTINE_TEST_DB");
        if(url!=null&&!url.matches("jdbc:postgresql://127\\.0\\.0\\.1:55489/routine_test"))throw new IllegalStateException("Isolated QA database only");
        source=new SingleConnectionDataSource(url==null?"jdbc:h2:mem:"+owner+";MODE=PostgreSQL;NON_KEYWORDS=DAY":url,url==null?"sa":"routine_test","",true);
        db=new JdbcTemplate(source);
        db.execute("create schema if not exists auth");db.execute("create table if not exists auth.users(id uuid primary key)");
        db.update("insert into auth.users values(?),(?)",owner,other);
        schema="routine_"+owner.toString().replace("-","");db.execute("create schema "+schema);db.execute("set search_path to "+schema+",public");
        db.execute("create table workflow_preferences(user_id uuid primary key,preferences text default '{}')");
        WorkflowTestSchema.apply(db,"V105__workflow_work_routine.sql");
        service=new WorkflowService(db,()->owner,JsonMapper.builder().build());
    }
    @AfterEach void close(){if(source!=null){if(schema!=null)db.execute("drop schema "+schema+" cascade");source.destroy();}}
    Block block(String type,UUID parent,int order,boolean checked){return new Block(UUID.randomUUID(),parent,order,type,"QA "+type,checked,null,null,null,Map.of());}
    WorkflowService.FixedTab input(long revision,List<Block> blocks){return new WorkflowService.FixedTab(other,"Spoofed title",revision,blocks);}
    @Test void headingTreeCheckboxesRoundtripAndResetUndoKeepContent() {
        assertThat(service.routine().blocks()).isEmpty();
        assertThat(db.queryForObject("select count(*) from workflow_work_routines",Long.class)).isZero();
        var h1=block("H1",null,0,false);var h2=block("H2",null,1,false);var h3=block("H3",null,2,false);
        var check=block("CHECKLIST",h3.id(),0,true);var nested=block("CHECKLIST",check.id(),0,true);var text=block("TEXT",null,3,false);
        var original=List.of(h1,h2,h3,check,nested,text);
        var saved=service.saveRoutine(input(0,original));assertThat(saved.id()).isEqualTo(owner);assertThat(saved.title()).isEqualTo("Work Routine");
        assertThat(service.routine().blocks()).isEqualTo(original);
        var cleared=original.stream().map(b->new Block(b.id(),b.parentId(),b.order(),b.type(),b.content(),false,b.workTaskId(),b.sourceBlockId(),b.sourceDate(),b.metadata())).toList();
        saved=service.saveRoutine(input(saved.revision(),cleared));assertThat(service.routine().blocks()).allMatch(b->!b.checked());
        service.saveRoutine(input(saved.revision(),original));assertThat(service.routine().blocks()).isEqualTo(original);
        assertThat(db.queryForObject("select count(*) from workflow_work_routines where user_id=?",Long.class,owner)).isEqualTo(1);
    }
    @Test void ownerScopeCannotBeOverriddenAndStaleWritesNeverReplaceDocument() {
        var saved=service.saveRoutine(input(0,List.of(block("H1",null,0,false))));
        var second=new WorkflowService(db,()->other,JsonMapper.builder().build());assertThat(second.routine().blocks()).isEmpty();
        second.saveRoutine(new WorkflowService.FixedTab(owner,"Work Routine",0,List.of(block("H2",null,0,false))));
        assertThat(service.routine()).isEqualTo(saved);
        assertThatThrownBy(()->service.saveRoutine(input(0,List.of()))).isInstanceOf(OptimisticLockConflictException.class);
        assertThat(service.routine()).isEqualTo(saved);
    }
    @Test void rejectsCrossDocumentReferencesAndInvalidHierarchyOrHeading() {
        var linked=new Block(UUID.randomUUID(),null,0,"CHECKLIST","bad",false,UUID.randomUUID(),null,null,Map.of());
        for(var b:List.of(linked,block("H4",null,0,false),block("TEXT",UUID.randomUUID(),0,false)))
            assertThatThrownBy(()->service.saveRoutine(input(0,List.of(b)))).isInstanceOf(InvalidRequestException.class);
        assertThat(service.routine().blocks()).isEmpty();
    }
}
