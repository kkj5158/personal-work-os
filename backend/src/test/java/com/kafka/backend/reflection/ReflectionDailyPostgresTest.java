package com.kafka.backend.reflection;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import java.sql.*;
import java.time.LocalDate;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

/** Explicitly opt-in isolated local fixture. Every row and schema rolls back. */
@EnabledIfEnvironmentVariable(named = "QA_REFLECTION_PG_URL", matches = ".+")
class ReflectionDailyPostgresTest {
    @Test void additiveMigrationPreservesExistingSnapshotAndEnforcesDateAndAnnotationInvariants() throws Exception {
        try (Connection connection = DriverManager.getConnection(System.getenv("QA_REFLECTION_PG_URL"), System.getenv("QA_REFLECTION_PG_USERNAME"), "")) {
            connection.setAutoCommit(false);
            var source = new SingleConnectionDataSource(connection, true);
            var db = new JdbcTemplate(source);
            try {
                String schema = "reflection_" + UUID.randomUUID().toString().replace("-", "");
                UUID owner = UUID.randomUUID(), other = UUID.randomUUID(), id = UUID.randomUUID();
                LocalDate date = LocalDate.of(2026,10,24);
                db.execute("create schema " + schema);
                db.execute("set local search_path to " + schema + ",public");
                db.execute("set local statement_timeout='10s'");
                db.update("insert into auth.users(id) values (?),(?)", owner, other);
                new ResourceDatabasePopulator(new ClassPathResource("db/migration/V31__create_reflection_entries.sql")).populate(connection);
                db.update("insert into reflection_entries(id,user_id,entry_date,content,status,snapshot,version) values (?,?,?,'NOTE content','COMPLETED','{\"historical\":true}'::jsonb,7)",id,owner,date);
                var before = db.queryForMap("select * from reflection_entries where id=?", id);
                new ResourceDatabasePopulator(new ClassPathResource("db/migration/V93__reflection_daily_annotations.sql")).populate(connection);
                var after = db.queryForMap("select * from reflection_entries where id=?", id);
                for (String key : before.keySet()) assertThat(after.get(key)).as(key).isEqualTo(before.get(key));
                for (String key : new String[]{"title","day_score","mood_level","memo"}) assertThat(after.get(key)).isNull();
                db.update("update reflection_entries set title=?,day_score=0,mood_level=5,memo=? where id=?", "x".repeat(100), "line one\n" + "x".repeat(9991), id);
                assertThat(db.queryForObject("select day_score from reflection_entries where id=?",Integer.class,id)).isZero();
                assertThat(db.queryForObject("select mood_level from reflection_entries where id=?",Integer.class,id)).isEqualTo(5);
                for (String sql : new String[]{"day_score=-1","day_score=101","mood_level=0","mood_level=6","title=E'one\\ntwo'","title=repeat('x',101)","memo=repeat('x',10001)"}) {
                    Savepoint point = connection.setSavepoint();
                    assertThatThrownBy(() -> db.update("update reflection_entries set " + sql + " where id=?",id)).as(sql).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
                    connection.rollback(point);
                }
                Savepoint unique = connection.setSavepoint();
                assertThatThrownBy(() -> db.update("insert into reflection_entries(id,user_id,entry_date) values (?,?,?)",UUID.randomUUID(),owner,date)).isInstanceOf(org.springframework.dao.DuplicateKeyException.class);
                connection.rollback(unique);
                db.update("insert into reflection_entries(id,user_id,entry_date) values (?,?,?)",UUID.randomUUID(),other,date);
                assertThat(db.queryForObject("select count(*) from reflection_entries",Integer.class)).isEqualTo(2);
                db.update("update reflection_entries set day_score=null,mood_level=null,title=null,memo=null where id=?",id);
                assertThat(db.queryForObject("select content from reflection_entries where id=?",String.class,id)).isEqualTo("NOTE content");
                assertThat(db.queryForObject("select version from reflection_entries where id=?",Integer.class,id)).isEqualTo(7);
            } finally { connection.rollback(); }
        }
    }
}
