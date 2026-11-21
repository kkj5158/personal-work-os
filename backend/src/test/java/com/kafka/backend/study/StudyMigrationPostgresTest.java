package com.kafka.backend.study;

import static org.assertj.core.api.Assertions.*;

import java.nio.file.*;
import java.sql.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

@EnabledIfEnvironmentVariable(
    named = "STUDY_TEST_DB",
    matches = "jdbc:postgresql://127\\.0\\.0\\.1:554(?:49|52)/postgres")
class StudyMigrationPostgresTest {
  @Test
  void studyUpgradeAppliesFoundationEngineAndHintsWithoutChangingPriorHistory() throws Exception {
    String base = System.getenv("STUDY_TEST_DB"),
        name = "study_release_upgrade_" + java.util.UUID.randomUUID().toString().replace("-", "");
    Path migrations = Files.createTempDirectory("study-prod-upgrade-");
    try (Connection admin = DriverManager.getConnection(base, "study_test", "");
        Statement a = admin.createStatement()) {
      a.execute("create database " + name);
      String target = base.substring(0, base.lastIndexOf('/') + 1) + name;
      try (Connection db = DriverManager.getConnection(target, "study_test", "");
          Statement s = db.createStatement()) {
        s.execute("create schema auth;create table auth.users(id uuid primary key)");
        for (String role : java.util.List.of("anon", "authenticated", "service_role"))
          a.execute(
              "do $$ begin if not exists(select from pg_roles where rolname='"
                  + role
                  + "') then create role "
                  + role
                  + ";end if;end $$");
        try (var files =
            Files.newDirectoryStream(Path.of("src/main/resources/db/migration"), "V*.sql")) {
          for (Path p : files)
            if (!p.getFileName().toString().startsWith("V104__")
                && !p.getFileName().toString().startsWith("V106__")
                && !p.getFileName().toString().startsWith("V125__"))
              Files.copy(p, migrations.resolve(p.getFileName()));
        }
        String location = "filesystem:" + migrations.toAbsolutePath().toString().replace('\\', '/');
        var before =
            Flyway.configure()
                .dataSource(target, "study_test", "")
                .locations(location)
                .cleanDisabled(true)
                .load();
        before.migrate();
        before.validate();
        s.execute(
            "create table unrelated_release_sentinel(id int primary key,body text);insert into"
                + " unrelated_release_sentinel values(1,'preserve PROD-only LOG and existing"
                + " data')");
        int checksum;
        try (var r =
            s.executeQuery("select checksum from flyway_schema_history where version='108'")) {
          r.next();
          checksum = r.getInt(1);
        }
        for (String file :
            java.util.List.of("V104__study_foundation.sql", "V106__study_learning_engine.sql",
                "V125__study_versioned_hints.sql"))
          Files.copy(Path.of("src/main/resources/db/migration", file), migrations.resolve(file));
        var upgrade =
            Flyway.configure()
                .dataSource(target, "study_test", "")
                .locations(location)
                .outOfOrder(true)
                .cleanDisabled(true)
                .load();
        assertThat(upgrade.migrate().migrationsExecuted).isEqualTo(3);
        var normal =
            Flyway.configure()
                .dataSource(target, "study_test", "")
                .locations(location)
                .cleanDisabled(true)
                .load();
        normal.validate();
        assertThat(normal.migrate().migrationsExecuted).isZero();
        try (var r =
            s.executeQuery("select checksum from flyway_schema_history where version='108'")) {
          r.next();
          assertThat(r.getInt(1)).isEqualTo(checksum);
        }
        try (var r =
            s.executeQuery(
                "select count(*) from pg_tables where schemaname='public' and tablename like"
                    + " 'study_%'")) {
          r.next();
          assertThat(r.getInt(1)).isEqualTo(8);
        }
        try (var r = s.executeQuery("select body from unrelated_release_sentinel where id=1")) {
          r.next();
          assertThat(r.getString(1)).isEqualTo("preserve PROD-only LOG and existing data");
        }
      } finally {
        a.execute("drop database " + name);
      }
    } finally {
      try (var files = Files.newDirectoryStream(migrations)) {
        for (Path p : files) Files.delete(p);
      }
      Files.delete(migrations);
    }
  }

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
