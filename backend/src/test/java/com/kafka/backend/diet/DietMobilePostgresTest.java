package com.kafka.backend.diet;
import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import tools.jackson.databind.json.JsonMapper;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import static com.kafka.backend.diet.DietTypes.*;
import static org.assertj.core.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="DIET_MOBILE_DB_TESTS",matches="1")
class DietMobilePostgresTest {
 @Test void paginationCanonicalMediaCalendarAndPlanCasPreserveFacts()throws Exception{
  try(var c=DriverManager.getConnection(System.getenv("DEV_DB_URL"),System.getenv("DEV_DB_USERNAME"),System.getenv("DEV_DB_PASSWORD"))){
   c.setAutoCommit(false);
   try{
    var db=new JdbcTemplate(new SingleConnectionDataSource(c,true));db.execute("set local statement_timeout='15s'");db.execute("set local lock_timeout='5s'");
    UUID owner=UUID.fromString(System.getenv("APP_DEV_USER_ID"));var json=JsonMapper.builder().build();
    var diet=new DietService(db,()->owner,json);var notes=new DietDailyNoteService(db,()->owner);var media=new DietCameraMediaService(db,()->owner);
    var mobile=new DietMobileService(db,()->owner,diet,notes,media,json);
    LocalDate first=LocalDate.of(2042,1,1);assertThat(notes.range(first,first.plusDays(24))).isEmpty();
    for(int i=0;i<20;i++)notes.save(first.plusDays(i),new DietDailyNoteService.NoteInput("원본\n본문 "+i,0L));
    var page=mobile.journal(null,null,"2042-01",9);var next=mobile.journal(page.nextCursor(),null,"2042-01",9);var last=mobile.journal(next.nextCursor(),null,"2042-01",9);
    assertThat(page.entries()).hasSize(9);assertThat(next.entries()).hasSize(9);assertThat(last.entries()).hasSize(2);assertThat(last.nextCursor()).isNull();
    var dates=new HashSet<LocalDate>();for(var p:List.of(page,next,last))p.entries().forEach(e->assertThat(dates.add(e.date())).isTrue());
    assertThat(dates).hasSize(20);assertThat(page.entries().getFirst().note().content()).isEqualTo("원본\n본문 19");
    assertThatThrownBy(()->mobile.journal(null,null,"2042-13",9)).isInstanceOf(InvalidRequestException.class);
    var stream=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(800,600,BufferedImage.TYPE_INT_RGB),"jpeg",stream);byte[] pixels=stream.toByteArray();
    UUID client=UUID.randomUUID();Instant at=first.plusDays(21).atStartOfDay(ZoneOffset.ofHours(9)).toInstant();String hash=DietCameraMediaService.digest(pixels);
    media.put(client,new DietCameraMediaService.Input(at,540,Base64.getEncoder().encodeToString(pixels),hash,null,null,1,false));
    var photos=mobile.journal(null,null,"2042-01",9);assertThat(photos.entries().getFirst().photos()).hasSize(1);assertThat(photos.entries().getFirst().date()).isEqualTo(first.plusDays(21));
    media.put(client,new DietCameraMediaService.Input(at,540,null,hash,null,at,2,false));assertThat(mobile.journal(null,null,"2042-01",9).entries().getFirst().date()).isEqualTo(first.plusDays(19));
    media.put(client,new DietCameraMediaService.Input(at,540,null,hash,null,null,3,false));assertThat(mobile.journal(null,null,"2042-01",9).entries().getFirst().photos()).hasSize(1);
    var small=ImageIO.read(new java.io.ByteArrayInputStream(DietCameraThumbnail.resize(pixels,400)));assertThat(small.getWidth()).isEqualTo(400);assertThat(small.getHeight()).isEqualTo(300);assertThat(media.image(client)).isEqualTo(pixels);
    var calendar=mobile.calendar(first,first.plusDays(23));assertThat(calendar.notes()).hasSize(20);assertThat(notes.get(first).version()).isEqualTo(1);
    UUID planId=UUID.randomUUID();var original=new Challenge(planId,"원본 챌린지",ChallengeType.MANUAL,ChallengeStatus.ACTIVE,first,first.plusDays(30),"#246e6b","핵심",List.of("보존 메모\n둘째 줄"),3,null,null,List.of(),GoalMode.COUNT,true,2.,10.,ChallengeRole.FINAL_GOAL,7);
    var saved=mobile.save(planId,new DietMobileService.PlanInput(original,"new"));assertThat(mobile.save(planId,new DietMobileService.PlanInput(original,"new")).version()).isEqualTo(saved.version());
    var changed=new Challenge(planId,original.title(),original.type(),original.status(),first.plusDays(1),original.endDate(),original.color(),original.keyPoint(),original.notes(),original.sortOrder(),original.startWeight(),original.targetWeight(),original.itemIds(),original.goalMode(),original.includeMissing(),original.currentValue(),original.targetValue(),original.role(),original.homeSortOrder());
    var updated=mobile.save(planId,new DietMobileService.PlanInput(changed,saved.version()));assertThat(updated.value().notes()).isEqualTo(original.notes());assertThat(updated.value().homeSortOrder()).isEqualTo(7);
    assertThatThrownBy(()->mobile.save(planId,new DietMobileService.PlanInput(original,saved.version()))).isInstanceOf(OptimisticLockConflictException.class);
    assertThatThrownBy(()->mobile.delete(planId,saved.version())).isInstanceOf(OptimisticLockConflictException.class);
    UUID foreign=UUID.randomUUID();var foreignDiet=new DietService(db,()->foreign,json);var foreignNotes=new DietDailyNoteService(db,()->foreign);var foreignMedia=new DietCameraMediaService(db,()->foreign);
    assertThat(new DietMobileService(db,()->foreign,foreignDiet,foreignNotes,foreignMedia,json).journal(null,null,"2042-01",9).entries()).isEmpty();
    assertThatThrownBy(()->foreignMedia.image(client)).isInstanceOf(ResourceNotFoundException.class);
    mobile.delete(planId,updated.version());assertThat(mobile.plans()).noneMatch(p->p.value().id().equals(planId));assertThat(notes.get(first).content()).isEqualTo("원본\n본문 0");
   }finally{c.rollback();}
  }
 }
}
