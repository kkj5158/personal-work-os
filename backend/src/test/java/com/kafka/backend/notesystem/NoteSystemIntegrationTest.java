package com.kafka.backend.notesystem;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import static com.kafka.backend.notesystem.NoteTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Opt-in real PostgreSQL tests. Each test owns a new workspace and rolls back.
 * Migrations must already be applied; these tests never mutate schema history. */
@EnabledIfEnvironmentVariable(named="DEV_DB_URL",matches=".+")
@SpringJUnitConfig(NoteSystemIntegrationTest.Config.class)
@Transactional
class NoteSystemIntegrationTest {
 @Configuration @EnableTransactionManagement static class Config {
  @Bean DriverManagerDataSource datasource(){return new DriverManagerDataSource(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"));}
  @Bean JdbcTemplate db(DriverManagerDataSource ds){return new JdbcTemplate(ds);}
  @Bean DataSourceTransactionManager transactionManager(DriverManagerDataSource ds){return new DataSourceTransactionManager(ds);}
  @Bean CurrentUserProvider users(){return ()->UUID.fromString(System.getenv("APP_DEV_USER_ID"));}
  @Bean ObjectMapper json(){return JsonMapper.builder().build();}
  @Bean NoteSystemService service(JdbcTemplate db,CurrentUserProvider users,ObjectMapper json){return new NoteSystemService(db,users,json);}
 }
 @Autowired NoteSystemService service;@Autowired JdbcTemplate db;
 UUID w;
 @BeforeEach void create(){w=service.createWorkspace(new WorkspaceInput("Note QA "+UUID.randomUUID(),"transaction rollback","notebook",false,null));}
 Note create(String title,String content){return service.save(w,new NoteInput(UUID.randomUUID(),null,title,content,0));}
 Note update(Note n,String content){return service.save(w,new NoteInput(n.id(),n.journalDate(),n.title(),content,n.version()));}
 @Test void dailyIsLazyUniqueAndFutureAddressable(){
  LocalDate date=LocalDate.now().plusDays(8);UUID id=UUID.randomUUID();
  assertThat(service.daily(w,date,14)).isEmpty();
  assertThat(service.save(w,new NoteInput(id,date,null,"",0))).isNull();
  Note n=service.save(w,new NoteInput(id,date,null,"한글 기록",0));assertThat(n.journalDate()).isEqualTo(date);
  assertThatThrownBy(()->service.save(w,new NoteInput(UUID.randomUUID(),date,null,"race",0))).isInstanceOf(OptimisticLockConflictException.class);
  assertThat(service.daily(w,date,14)).hasSize(1);
 }
 @Test void autosaveRejectsStaleAndRetainsLatest(){Note n=create("autosave","old");update(n,"latest");assertThatThrownBy(()->update(n,"stale")).isInstanceOf(OptimisticLockConflictException.class);assertThat(service.note(w,n.id()).content()).isEqualTo("latest");}
 @Test void renamePreservesIdentityAliasesAndNamespace(){
  Note n=create("방향성","");n=service.rename(w,n.id(),new RenameInput("나의 길",n.version()));
  assertThat(n.aliases()).containsExactly("방향성");assertThat(service.resolveNote(w,"방향성").id()).isEqualTo(n.id());
  final Note target=n;assertThatThrownBy(()->create("방향성","")).isInstanceOf(OptimisticLockConflictException.class);
  n=service.rename(w,n.id(),new RenameInput("방향성",n.version()));assertThat(n.aliases()).containsExactly("나의 길");
  Note another=create("other","");assertThatThrownBy(()->service.rename(w,another.id(),new RenameInput("나의 길",another.version()))).isInstanceOf(OptimisticLockConflictException.class);
  assertThat(service.resolveNote(w,"방향성").id()).isEqualTo(target.id());
 }
 @Test void pendingResolutionRebuildAndBacklinksAreIdempotent(){
  Note source=create("source","[[future]] and [[future]]");assertThat(service.pending(w).getFirst().mentions()).isEqualTo(2);
  Note target=create("future","");assertThat(service.pending(w)).isEmpty();assertThat(service.references(w,target.id(),"")).hasSize(2);
  source=update(source,source.content());assertThat(service.references(w,target.id(),"")).hasSize(2);
  service.rename(w,target.id(),new RenameInput("renamed",target.version()));source=update(source,"[[future]]");
  assertThat(service.references(w,target.id(),"")).hasSize(1);update(source,"future plain text");assertThat(service.references(w,target.id(),"")).isEmpty();
 }
 @Test void metricsCountUniqueNeighborsAndAggregateEdges(){
  Note target=create("concept","");Note a=service.save(w,new NoteInput(UUID.randomUUID(),LocalDate.of(2026,9,1),null,"[[concept]] [[concept]]",0));
  create("other","[[concept]]");update(target,"[[other]]");
  Metric metric=service.metrics(w).stream().filter(m->m.id().equals(target.id())).findFirst().orElseThrow();
  assertThat(metric.connectedNotes()).isEqualTo(2);assertThat(metric.dailyDates()).isEqualTo(1);assertThat(metric.mentions()).isEqualTo(4);
  assertThat(metric.incoming()).isEqualTo(2);assertThat(metric.outgoing()).isEqualTo(1);assertThat(metric.growth30Days()).isEqualTo(2);
  var graph=service.graph(w);assertThat(graph.edges().stream().filter(e->e.source().equals(a.id().toString())).findFirst().orElseThrow().weight()).isEqualTo(2);
  assertThat(graph.nodes().stream().filter(n->n.id().equals(target.id().toString())).findFirst().orElseThrow().orphan()).isFalse();
 }
 @Test void connectionGrowthUsesFirstRelationshipRatherThanAutosaveTime(){
  Note target=create("target","");Note source=create("source","[[target]]");
  db.update("update journal_connection_history set first_connected_at=now()-interval '60 days' where workspace_id=?",w);
  update(source,"more [[target]]");assertThat(service.metrics(w).stream().filter(m->m.id().equals(target.id())).findFirst().orElseThrow().growth30Days()).isZero();
 }
 @Test void tagsAreMetadataAndTrashPreservesNamespace(){
  Note n=create("note","");service.tag(w,n.id(),"Reflection",true);service.tag(w,n.id(),"reflection",true);
  assertThat(service.tags(w)).hasSize(1);assertThat(service.tags(w).getFirst().usageCount()).isEqualTo(1);assertThat(service.graph(w).edges()).isEmpty();
  service.deleteTag(w,service.tags(w).getFirst().id());assertThat(service.note(w,n.id()).tags()).isEmpty();
  n=service.trash(w,n.id(),new VersionInput(n.version(),true));assertThat(service.library(w,"ALL","",null,0,50).items()).isEmpty();
  n=service.trash(w,n.id(),new VersionInput(n.version(),false));assertThat(n.deletedAt()).isNull();
 }
 @Test void recentMeansOpenedAndKeepsFiftyDistinct(){
  Note first=create("first","");service.visit(w,first.id());for(int i=0;i<51;i++){Note n=create("n"+i,"");service.visit(w,n.id());}
  service.visit(w,first.id());service.visit(w,first.id());var recent=service.library(w,"RECENT","",null,0,100).items();assertThat(recent).hasSize(50);assertThat(recent.getFirst().id()).isEqualTo(first.id());
 }
 @Test void workspaceSettingsArchiveRestoreAndSafeDelete(){
  var modules=new ArrayList<ModuleSetting>();int i=0;for(var m:NoteTypes.Module.values())modules.add(new ModuleSetting(m,m!=NoteTypes.Module.GRAPH,i++,m==NoteTypes.Module.ALL_NOTES));Collections.reverse(modules);
  service.updateWorkspace(w,new WorkspaceInput("renamed "+w,"desc","book",true,modules));
  assertThatThrownBy(()->create("blocked","")).isInstanceOf(InvalidRequestException.class);
  service.updateWorkspace(w,new WorkspaceInput("renamed "+w,"desc","book",false,modules));create("works","");
  assertThat(service.workspaces().stream().filter(x->x.id().equals(w)).findFirst().orElseThrow().modules().getFirst().module()).isEqualTo(NoteTypes.Module.GRAPH);
 }
 @Test void ownershipAndForeignMediaAreRejected(){
  assertThatThrownBy(()->service.library(UUID.randomUUID(),"ALL","",null,0,50)).isInstanceOf(ResourceNotFoundException.class);
  assertThatThrownBy(()->create("bad media","![x](media:"+UUID.randomUUID()+")")).isInstanceOf(InvalidRequestException.class);
 }
 @Test void searchIncludesAliasesTagsDateAndKoreanBody(){
  Note n=create("old","한글 본문");n=service.rename(w,n.id(),new RenameInput("new",n.version()));service.tag(w,n.id(),"생각",true);
  assertThat(service.search(w,"old",30)).hasSize(1);assertThat(service.search(w,"한글",30)).hasSize(1);assertThat(service.search(w,"생각",30)).hasSize(2);
 }
}
