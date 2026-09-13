package com.kafka.backend.calendarvisualgroup;

import org.hibernate.cfg.Configuration;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Isolated in-memory DB only: no application context, environment datasource or Flyway startup. */
class CalendarVisualGroupPersistenceTest {
    @Test void dateOverridesRoundTripReplaceWithoutUniqueCollisionAndCascadeOnDelete(){
        try(var factory=new Configuration().addAnnotatedClass(CalendarVisualGroup.class).addAnnotatedClass(CalendarVisualGroupDay.class)
                .setProperty("hibernate.connection.driver_class","org.h2.Driver")
                .setProperty("hibernate.connection.url","jdbc:h2:mem:visualgroups;DB_CLOSE_DELAY=-1")
                .setProperty("hibernate.hbm2ddl.auto","create-drop").buildSessionFactory()){
            var date=LocalDate.of(2026,9,14);var owner=UUID.randomUUID();var id=UUID.randomUUID();
            try(var session=factory.openSession()){
                var tx=session.beginTransaction();var group=new CalendarVisualGroup(id,owner);
                group.apply(new VisualGroupRequest("Group",date,date.plusMonths(1),VisualGroupTimeRule.PER_DAY,"#789abc",null,null,List.of(),List.of(
                        new VisualGroupRequest.Day(date,true,LocalTime.of(9,0),LocalTime.of(18,0)),new VisualGroupRequest.Day(date.plusDays(1),false,null,null))));
                session.persist(group);tx.commit();
            }
            try(var session=factory.openSession()){
                var tx=session.beginTransaction();var group=session.find(CalendarVisualGroup.class,id);assertThat(group.getDays()).hasSize(2);
                assertThat(group.getCreatedAt()).isNotNull();assertThat(group.getUpdatedAt()).isNotNull();
                UUID retained=group.getDays().getFirst().getId();
                group.apply(new VisualGroupRequest("Moved",date,date.plusMonths(1),VisualGroupTimeRule.PER_DAY,"#789abc",null,null,List.of(),List.of(
                        new VisualGroupRequest.Day(date,true,LocalTime.of(10,5),LocalTime.of(18,5)),new VisualGroupRequest.Day(date.plusDays(2),true,LocalTime.NOON,LocalTime.of(13,0)))));
                session.flush();session.clear();group=session.find(CalendarVisualGroup.class,id);
                assertThat(group.getDays()).hasSize(2);assertThat(group.getDays().getFirst().getId()).isEqualTo(retained);
                assertThat(group.getDays()).noneMatch(d->d.getEntryDate().equals(date.plusDays(1)));
                group.apply(new VisualGroupRequest("All day",date,date.plusMonths(1),VisualGroupTimeRule.ALL_DAY,"#789abc",null,null,List.of(),List.of()));
                session.flush();assertThat(session.createQuery("select count(d) from CalendarVisualGroupDay d",Long.class).getSingleResult()).isZero();
                group.apply(new VisualGroupRequest("Per day again",date,date.plusMonths(1),VisualGroupTimeRule.PER_DAY,"#789abc",null,null,List.of(),List.of(new VisualGroupRequest.Day(date,true,LocalTime.NOON,LocalTime.of(13,0)))));
                session.flush();session.remove(group);session.flush();
                assertThat(session.createQuery("select count(d) from CalendarVisualGroupDay d",Long.class).getSingleResult()).isZero();tx.commit();
            }
        }
    }
}
