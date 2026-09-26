package com.kafka.backend.checklistsys;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static com.kafka.backend.checklistsys.ChecklistSysTypes.*;
import static org.assertj.core.api.Assertions.*;

/** Opt-in DEV PostgreSQL coverage (requires Flyway V51 on DEV). Every fixture, including auth owners, rolls back. */
@EnabledIfEnvironmentVariable(named = "CHECKLIST_SYS_DB_TEST", matches = "true")
@SpringJUnitConfig(ChecklistSysIntegrationTest.Config.class)
@Transactional
class ChecklistSysIntegrationTest {
    static class TestUser implements CurrentUserProvider { UUID id; public UUID getCurrentUserId() { return id; } }
    static class TestClock { LocalDate today = LocalDate.of(2026, 9, 20); }

    @Configuration @EnableTransactionManagement
    static class Config {
        @Bean DriverManagerDataSource datasource() { return new DriverManagerDataSource(System.getenv("DEV_DB_URL"), System.getenv("DEV_DB_USERNAME"), System.getenv("DEV_DB_PASSWORD")); }
        @Bean JdbcTemplate db(DriverManagerDataSource ds) { return new JdbcTemplate(ds); }
        @Bean DataSourceTransactionManager transactionManager(DriverManagerDataSource ds) { return new DataSourceTransactionManager(ds); }
        @Bean TestUser users() { return new TestUser(); }
        @Bean TestClock clock() { return new TestClock(); }
        @Bean ChecklistSysService service(JdbcTemplate db, TestUser users, TestClock clock) { return new ChecklistSysService(db, users, () -> clock.today); }
    }

    @Autowired ChecklistSysService service;
    @Autowired JdbcTemplate db;
    @Autowired TestUser user;
    @Autowired TestClock clock;
    UUID area;

    @BeforeEach void owner() {
        clock.today = LocalDate.of(2026, 9, 20);
        user.id = newOwner();
        UUID identity = UUID.randomUUID();
        service.saveIdentity(identity, new Identity(identity, "REN", "", "#6cc68b", 0));
        area = UUID.randomUUID();
        service.saveArea(area, new Area(area, identity, "가벼움 / 다이어트", "", "#6cc68b", 0));
    }

    UUID newOwner() { UUID id = UUID.randomUUID(); db.update("insert into auth.users(id) values(?)", id); return id; }

    UUID item(String name, Importance importance) {
        UUID id = UUID.randomUUID();
        service.saveItem(id, new Item(id, area, name, "", importance, "utensils", 0, LocalDate.of(2026, 9, 1), null, null));
        return id;
    }

    void record(UUID item, String date, RecordState state) { service.saveRecords(new RecordChanges(List.of(new RecordChange(item, LocalDate.parse(date), state)))); }

    RecordState stateOf(UUID item, String date) {
        return service.records(LocalDate.parse(date), LocalDate.parse(date)).stream().filter(r -> r.itemId().equals(item)).map(DailyRecord::state).findFirst().orElse(null);
    }

    @Test void successFailureAndNotRecordedPersistDistinctlyAndClearRemovesTheRow() {
        UUID meal = item("매일 식단 기록", Importance.CORE);
        service.saveRecords(new RecordChanges(List.of(
                new RecordChange(meal, LocalDate.of(2026, 9, 10), RecordState.SUCCESS),
                new RecordChange(meal, LocalDate.of(2026, 9, 11), RecordState.FAILURE),
                new RecordChange(meal, LocalDate.of(2026, 9, 12), RecordState.NOT_RECORDED))));
        assertThat(service.records(LocalDate.of(2026, 9, 10), LocalDate.of(2026, 9, 12))).extracting(DailyRecord::state)
                .containsExactly(RecordState.SUCCESS, RecordState.FAILURE, RecordState.NOT_RECORDED);
        record(meal, "2026-09-12", RecordState.SUCCESS);
        assertThat(stateOf(meal, "2026-09-12")).isEqualTo(RecordState.SUCCESS);
        record(meal, "2026-09-10", null);
        assertThat(stateOf(meal, "2026-09-10")).isNull();
        assertThat(service.records(LocalDate.of(2026, 9, 10), LocalDate.of(2026, 9, 12))).hasSize(2);
    }

    @Test void multiCellAndDateLevelBatchesAreAtomic() {
        UUID a = item("A", Importance.CORE), b = item("B", Importance.OPTIONAL);
        record(a, "2026-09-15", RecordState.SUCCESS);
        // Date-level NOT_RECORDED for the whole set is one batch of item-level rows.
        service.saveRecords(new RecordChanges(List.of(new RecordChange(a, LocalDate.of(2026, 9, 16), RecordState.NOT_RECORDED), new RecordChange(b, LocalDate.of(2026, 9, 16), RecordState.NOT_RECORDED))));
        assertThat(service.records(LocalDate.of(2026, 9, 16), LocalDate.of(2026, 9, 16))).extracting(DailyRecord::state).containsOnly(RecordState.NOT_RECORDED).hasSize(2);
        // One invalid cell (before start date) rejects the whole batch — the valid cell is not written.
        assertThatThrownBy(() -> service.saveRecords(new RecordChanges(List.of(
                new RecordChange(a, LocalDate.of(2026, 9, 17), RecordState.FAILURE),
                new RecordChange(b, LocalDate.of(2026, 8, 1), RecordState.FAILURE))))).isInstanceOf(InvalidRequestException.class);
        assertThat(stateOf(a, "2026-09-17")).isNull();
        assertThatThrownBy(() -> record(a, "2026-09-21", RecordState.SUCCESS)).isInstanceOf(InvalidRequestException.class);
        assertThat(stateOf(a, "2026-09-15")).isEqualTo(RecordState.SUCCESS);
    }

    @Test void archivePreservesHistoryStopsUsageAndRestoreContinuesTheSameItem() {
        UUID water = item("물 2L 이상 마시기", Importance.CORE);
        record(water, "2026-09-18", RecordState.SUCCESS);
        record(water, "2026-09-19", RecordState.NOT_RECORDED);
        service.archiveItem(water);
        Item archived = service.catalog().items().stream().filter(i -> i.id().equals(water)).findFirst().orElseThrow();
        assertThat(archived.archivedOn()).isEqualTo(LocalDate.of(2026, 9, 20));
        assertThat(archived.lastRecordOn()).isEqualTo(LocalDate.of(2026, 9, 19));
        assertThat(stateOf(water, "2026-09-18")).isEqualTo(RecordState.SUCCESS);
        assertThatThrownBy(() -> record(water, "2026-09-20", RecordState.SUCCESS)).isInstanceOf(InvalidRequestException.class);

        clock.today = LocalDate.of(2026, 9, 25);
        service.restoreItem(water);
        var catalog = service.catalog();
        Item restored = catalog.items().stream().filter(i -> i.id().equals(water)).findFirst().orElseThrow();
        assertThat(restored.archivedOn()).isNull();
        assertThat(catalog.archivePeriods()).containsExactly(new ArchivePeriod(water, LocalDate.of(2026, 9, 20), LocalDate.of(2026, 9, 25)));
        // The archived interval stays untouched (never a failure) and cannot be backfilled.
        assertThat(service.records(LocalDate.of(2026, 9, 20), LocalDate.of(2026, 9, 24))).isEmpty();
        assertThatThrownBy(() -> record(water, "2026-09-22", RecordState.FAILURE)).isInstanceOf(InvalidRequestException.class);
        record(water, "2026-09-25", RecordState.SUCCESS);
        assertThat(service.records(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30))).extracting(DailyRecord::itemId).containsOnly(water).hasSize(3);
    }

    @Test void manualSameNameCreationIsANewIndependentItem() {
        UUID original = item("야식 먹지 않기", Importance.CORE);
        record(original, "2026-09-10", RecordState.SUCCESS);
        service.archiveItem(original);
        UUID recreated = item("야식 먹지 않기", Importance.CORE);
        assertThat(recreated).isNotEqualTo(original);
        record(recreated, "2026-09-20", RecordState.FAILURE);
        assertThat(stateOf(original, "2026-09-10")).isEqualTo(RecordState.SUCCESS);
        assertThat(stateOf(recreated, "2026-09-10")).isNull();
        assertThat(service.catalog().items()).filteredOn(i -> i.id().equals(original)).extracting(Item::archivedOn).containsExactly(LocalDate.of(2026, 9, 20));
    }

    @Test void importanceIsStoredButNeverDrivesOrder() {
        UUID optional = item("OPTIONAL first", Importance.OPTIONAL), core = item("CORE second", Importance.CORE), secondary = item("SECONDARY third", Importance.SECONDARY);
        assertThat(service.catalog().items()).extracting(Item::id).containsExactly(optional, core, secondary);
        assertThat(service.catalog().items()).extracting(Item::importance).containsExactly(Importance.OPTIONAL, Importance.CORE, Importance.SECONDARY);
        service.orderItems(new OrderInput(area, List.of(secondary, optional, core)));
        assertThat(service.catalog().items()).extracting(Item::id).containsExactly(secondary, optional, core);
        assertThat(service.catalog().items()).extracting(Item::importance).containsExactly(Importance.SECONDARY, Importance.OPTIONAL, Importance.CORE);
    }

    @Test void structureDeletesNeverOrphanItemsOrHistory() {
        item("A", Importance.CORE);
        assertThatThrownBy(() -> service.deleteArea(area)).isInstanceOf(InvalidRequestException.class);
        UUID identity = service.catalog().identities().getFirst().id();
        assertThatThrownBy(() -> service.deleteIdentity(identity)).isInstanceOf(InvalidRequestException.class);
    }

    @Test void ownershipIsEnforced() {
        UUID mine = item("A", Importance.CORE);
        record(mine, "2026-09-19", RecordState.SUCCESS);
        user.id = newOwner();
        assertThat(service.catalog().items()).isEmpty();
        assertThat(service.records(LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 30))).isEmpty();
        assertThatThrownBy(() -> record(mine, "2026-09-19", RecordState.FAILURE)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.archiveItem(mine)).isInstanceOf(ResourceNotFoundException.class);
    }

    /** Regression (real-use Identity edit): an existing Identity's name/description/color update in place and re-read. */
    @Test void identityEditPersistsNameDescriptionAndColor() {
        UUID identity = service.catalog().identities().getFirst().id();
        service.saveIdentity(identity, new Identity(identity, "  REN · 몸 ", "건강과 식사", "#4c7ef0", 99));
        assertThat(service.catalog().identities()).singleElement().satisfies(saved -> {
            assertThat(saved.id()).isEqualTo(identity);
            assertThat(saved.name()).isEqualTo("REN · 몸");
            assertThat(saved.description()).isEqualTo("건강과 식사");
            assertThat(saved.color()).isEqualTo("#4c7ef0");
            assertThat(saved.sortOrder()).as("order is not changed by an edit").isZero();
        });
        assertThat(service.catalog().areas()).extracting(Area::identityId).containsOnly(identity);
    }

    /** Journal DnD: item order (same Area), Identity order and Area order (same Identity) all persist. */
    @Test void journalOrderingPersistsPerLevel() {
        UUID a = item("A", Importance.CORE), b = item("B", Importance.CORE), c = item("C", Importance.CORE);
        service.orderItems(new OrderInput(area, List.of(c, a)));
        assertThat(service.catalog().items()).extracting(Item::name).containsExactly("C", "B", "A");
        UUID ren = service.catalog().identities().getFirst().id(), kafka = UUID.randomUUID();
        service.saveIdentity(kafka, new Identity(kafka, "KAFKA", "", "#9b7fe6", 0));
        service.orderIdentities(new OrderInput(null, List.of(kafka, ren)));
        assertThat(service.catalog().identities()).extracting(Identity::name).containsExactly("KAFKA", "REN");
        UUID sleep = UUID.randomUUID();
        service.saveArea(sleep, new Area(sleep, ren, "수면", "", "#6cc68b", 0));
        service.orderAreas(new OrderInput(ren, List.of(sleep, area)));
        assertThat(service.catalog().areas()).extracting(Area::name).containsExactly("수면", "가벼움 / 다이어트");
        assertThat(service.catalog().items()).extracting(Item::areaId).containsOnly(area);
        assertThatThrownBy(() -> service.orderAreas(new OrderInput(kafka, List.of(sleep)))).as("Areas never reorder across Identities")
                .isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.orderItems(new OrderInput(sleep, List.of(b)))).as("items never reorder across Areas")
                .isInstanceOf(ResourceNotFoundException.class);
    }

    /** Sixth-pass: an Area dragged to another Identity keeps its id, items, records and archive history. */
    @Test void areaMovesToAnotherIdentityKeepingIdItemsAndHistory() {
        UUID ren = service.catalog().identities().getFirst().id();
        UUID water = item("물 2L", Importance.CORE), old = item("옛 습관", Importance.CORE);
        record(water, "2026-09-19", RecordState.SUCCESS);
        record(old, "2026-09-18", RecordState.NOT_RECORDED);
        service.archiveItem(old);
        UUID freedom = UUID.randomUUID(), habits = UUID.randomUUID();
        service.saveIdentity(freedom, new Identity(freedom, "Freedom", "", "#9b7fe6", 0));
        service.saveArea(habits, new Area(habits, freedom, "습관 끊어내기", "", "#9b7fe6", 0));

        service.moveArea(area, new OrderInput(freedom, List.of(area, habits)));

        Catalog catalog = service.catalog();
        assertThat(catalog.areas()).filteredOn(a -> a.id().equals(area)).singleElement().satisfies(moved -> {
            assertThat(moved.identityId()).isEqualTo(freedom);
            assertThat(moved.name()).isEqualTo("가벼움 / 다이어트");
        });
        assertThat(catalog.areas()).filteredOn(a -> a.identityId().equals(freedom)).extracting(Area::id).containsExactly(area, habits);
        assertThat(catalog.areas()).filteredOn(a -> a.identityId().equals(ren)).isEmpty();
        assertThat(catalog.items()).extracting(Item::id).containsExactlyInAnyOrder(water, old);
        assertThat(catalog.items()).extracting(Item::areaId).containsOnly(area);
        assertThat(catalog.archivePeriods()).extracting(ArchivePeriod::itemId).containsExactly(old);
        assertThat(stateOf(water, "2026-09-19")).isEqualTo(RecordState.SUCCESS);
        assertThat(stateOf(old, "2026-09-18")).isEqualTo(RecordState.NOT_RECORDED);
        // Same-Identity moves are plain reorders through the same path.
        service.moveArea(area, new OrderInput(freedom, List.of(habits, area)));
        assertThat(service.catalog().areas()).filteredOn(a -> a.identityId().equals(freedom)).extracting(Area::id).containsExactly(habits, area);
    }

    @Test void areaMoveRejectsBadOrdersAndForeignOwnersWithoutChangingAnything() {
        UUID ren = service.catalog().identities().getFirst().id();
        UUID other = UUID.randomUUID();
        service.saveIdentity(other, new Identity(other, "KAFKA", "", "#4c7ef0", 1));
        assertThatThrownBy(() -> service.moveArea(area, new OrderInput(other, List.of(UUID.randomUUID(), area))))
                .isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> service.moveArea(area, new OrderInput(other, List.of()))).isInstanceOf(InvalidRequestException.class);
        assertThat(service.catalog().areas()).extracting(Area::identityId).containsOnly(ren);

        UUID owner = user.id;
        user.id = newOwner();
        UUID strangerIdentity = UUID.randomUUID();
        service.saveIdentity(strangerIdentity, new Identity(strangerIdentity, "X", "", "#4c7ef0", 0));
        assertThatThrownBy(() -> service.moveArea(area, new OrderInput(strangerIdentity, List.of(area)))).as("cannot move another user's Area")
                .isInstanceOf(ResourceNotFoundException.class);
        user.id = owner;
        assertThatThrownBy(() -> service.moveArea(area, new OrderInput(strangerIdentity, List.of(area)))).as("cannot move into another user's Identity")
                .isInstanceOf(ResourceNotFoundException.class);
        assertThat(service.catalog().areas()).extracting(Area::identityId).containsOnly(ren);
    }
}
