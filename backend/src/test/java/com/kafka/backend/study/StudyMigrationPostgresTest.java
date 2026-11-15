package com.kafka.backend.study;

import static org.assertj.core.api.Assertions.*;

import java.nio.file.*;
import java.sql.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

@EnabledIfEnvironmentVariable(
    named = "STUDY_TEST_DB",
    matches = "jdbc:postgresql://127\\.0\\.0\\.1:55449/postgres")
class StudyMigrationPostgresTest {
  @Test
  void migrationPreservesPreexistingDataValidatesAndRollsBackAtomically() throws Exception {
    String base = System.getenv("STUDY_TEST_DB"), schema = "study_upgrade_owned";
    Path migrations = Files.createTempDirectory("study-migrations-");
    Path file = migrations.resolve("V104__study_foundation.sql");
    String sql =
        Files.readString(Path.of("src/main/resources/db/migration/V104__study_foundation.sql"));
    Files.writeString(file, sql);
    try (Connection c = DriverManager.getConnection(base, "study_test", "");
        Statement s = c.createStatement()) {
      s.execute(
          "create schema if not exists auth;create table if not exists auth.users(id uuid primary"
              + " key);create schema "
              + schema);
      s.execute("set search_path to " + schema + ",public");
      s.execute(
          "create table unrelated_sentinel(id int primary key,body text not null);insert into"
              + " unrelated_sentinel values(1,'preserve meaningful pre-existing data')");
      c.setAutoCommit(false);
      assertThatThrownBy(() -> s.execute(sql + "; select 1/0")).isInstanceOf(SQLException.class);
      c.rollback();
      c.setAutoCommit(true);
      try (ResultSet r =
          s.executeQuery("select to_regclass('" + schema + ".study_workspaces') is null")) {
        r.next();
        assertThat(r.getBoolean(1)).isTrue();
      }
      Flyway flyway =
          Flyway.configure()
              .dataSource(base + "?currentSchema=" + schema + ",public", "study_test", "")
              .schemas(schema)
              .defaultSchema(schema)
              .locations("filesystem:" + migrations.toAbsolutePath().toString().replace('\\', '/'))
              .baselineOnMigrate(true)
              .baselineVersion("103")
              .cleanDisabled(true)
              .load();
      assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
      flyway.validate();
      assertThat(flyway.migrate().migrationsExecuted).isZero();
      try (ResultSet r = s.executeQuery("select body from unrelated_sentinel where id=1")) {
        r.next();
        assertThat(r.getString(1)).isEqualTo("preserve meaningful pre-existing data");
      }
      try (ResultSet r =
          s.executeQuery(
              "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where"
                  + " n.nspname='"
                  + schema
                  + "' and c.relname like 'study_%' and c.relkind='r' and c.relrowsecurity")) {
        r.next();
        assertThat(r.getInt(1)).isEqualTo(4);
      }
    } finally {
      try (Connection c = DriverManager.getConnection(base, "study_test", "");
          Statement s = c.createStatement()) {
        s.execute("drop schema if exists study_upgrade_owned cascade");
      }
      Files.deleteIfExists(file);
      Files.deleteIfExists(migrations);
    }
  }
}
