package com.kafka.backend.workflow.attention;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="QA_ATTENTION_PG_URL",matches=".+")
class AttentionReleaseOrderPostgresTest {
    @Test
    void verifiesMissingV122AfterNaverV123InOwnedPostgres(@TempDir Path files) throws Exception {
        var source=new DriverManagerDataSource(System.getenv("QA_ATTENTION_PG_URL"),"attention_snapshot_synthetic","");
        var db=new JdbcTemplate(source);
        assertThat(db.queryForObject("select shobj_description(oid,'pg_database') from pg_database where datname=current_database()",String.class))
            .isEqualTo("owned-work-queue-snapshot-qa");
        var schema="attention_order_"+UUID.randomUUID().toString().replace("-","");
        var migrationRoot=Path.of("src/main/resources/db/migration");
        var existing=List.of("V72__workflow_attention_queue.sql","V82__workflow_attention_memo.sql",
            "V111__attention_unified_groups.sql","V115__attention_persistent_credentials.sql",
            "V116__naver_owner_archive.sql","V117__attention_management.sql","V123__naver_rss_discovery.sql");
        for(var name:existing)Files.copy(migrationRoot.resolve(name),files.resolve(name));
        var flyway=Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema)
            .locations("filesystem:"+files).cleanDisabled(true).load();
        var owner=UUID.randomUUID();
        try {
            assertThat(flyway.migrate().migrationsExecuted).isEqualTo(existing.size());
            db.update("insert into auth.users(id) values(?)",owner);
            db.update("insert into "+schema+".attention_queues(user_id,revision,next_sequence) values(?,11,17)",owner);
            db.update("insert into "+schema+".naver_archive_rss_config(owner_id,enabled) values(?,false)",owner);
            var baseline=db.queryForList("select installed_rank,version,checksum,success from "+schema+".flyway_schema_history order by installed_rank");
            var beforeQueue=db.queryForObject("select to_jsonb(q)::text from "+schema+".attention_queues q where user_id=?",String.class,owner);
            var beforeNaver=db.queryForObject("select to_jsonb(n)::text from "+schema+".naver_archive_rss_config n where owner_id=?",String.class,owner);

            for(var name:List.of("V122__attention_managed_content.sql","V124__attention_source_attestation.sql"))
                Files.copy(migrationRoot.resolve(name),files.resolve(name));
            var withMissing=Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema)
                .locations("filesystem:"+files).cleanDisabled(true).load();
            assertThatThrownBy(withMissing::migrate).isInstanceOf(FlywayException.class);
            assertThat(db.queryForList("select installed_rank,version,checksum,success from "+schema+".flyway_schema_history order by installed_rank"))
                .isEqualTo(baseline);

            var oneTime=Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema)
                .locations("filesystem:"+files).outOfOrder(true).cleanDisabled(true).load();
            assertThat(oneTime.migrate().migrationsExecuted).isEqualTo(2);
            assertThat(db.queryForList("select version from "+schema+".flyway_schema_history where version in ('122','124') order by installed_rank",String.class))
                .containsExactly("122","124");
            assertThat(db.queryForList("select installed_rank,version,checksum,success from "+schema+".flyway_schema_history where version not in ('122','124') order by installed_rank"))
                .isEqualTo(baseline);
            assertThat(db.queryForObject("select to_jsonb(q)::text from "+schema+".attention_queues q where user_id=?",String.class,owner)).isEqualTo(beforeQueue);
            assertThat(db.queryForObject("select to_jsonb(n)::text from "+schema+".naver_archive_rss_config n where owner_id=?",String.class,owner)).isEqualTo(beforeNaver);
            assertThat(db.queryForObject("select relrowsecurity from pg_class where oid=to_regclass(?)",Boolean.class,schema+".attention_content_verifications")).isTrue();
            var normal=Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema)
                .locations("filesystem:"+files).cleanDisabled(true).load();
            normal.validate();
            assertThat(normal.migrate().migrationsExecuted).isZero();
        } finally {
            db.execute("drop schema if exists "+schema+" cascade");
            db.update("delete from auth.users where id=?",owner);
        }
    }
}
