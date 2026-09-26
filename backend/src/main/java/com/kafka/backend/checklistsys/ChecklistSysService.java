package com.kafka.backend.checklistsys;

import com.kafka.backend.common.AppTimeZone;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import com.kafka.backend.common.ResourceNotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.Supplier;

import static com.kafka.backend.checklistsys.ChecklistSysTypes.*;

/**
 * CHECKLIST SYS persistence. Ownership is enforced on every statement via
 * {@code owner_id}; structural mutations (catalog/order/archive) serialize per
 * owner with a transaction-scoped advisory lock, while record writes are
 * row-level upserts that never block one another.
 */
@Service
@Transactional
public class ChecklistSysService {
    static final String ARCHIVE_DOMAIN = "CHECKLIST";
    static final int MAX_CHANGES = 2000;
    static final int MAX_RANGE_DAYS = 3700;

    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final Supplier<LocalDate> today;

    @Autowired
    public ChecklistSysService(JdbcTemplate db, CurrentUserProvider users) {
        this(db, users, () -> LocalDate.now(AppTimeZone.ZONE));
    }

    ChecklistSysService(JdbcTemplate db, CurrentUserProvider users, Supplier<LocalDate> today) {
        this.db = db;
        this.users = users;
        this.today = today;
    }

    private UUID owner() { return users.getCurrentUserId(); }

    private void lock() {
        db.queryForObject("select 1 from (select pg_advisory_xact_lock(hashtextextended(?, 0))) locked", Integer.class, "checklist-sys:" + owner());
    }

    private static void require(boolean valid, String message) {
        if (!valid) throw new InvalidRequestException(message);
    }

    private static String text(String value, int max, boolean required) {
        String v = Objects.requireNonNullElse(value, "").trim();
        require(v.length() <= max && (!required || !v.isEmpty()), "이름은 필수이며 길이 제한을 확인하세요.");
        return v;
    }

    private static String color(String value) {
        require(value != null && value.matches("#[0-9a-fA-F]{6}"), "색상 값을 확인하세요.");
        return value;
    }

    private static void same(UUID path, UUID body) {
        require(body == null || path.equals(body), "요청 ID가 일치하지 않습니다.");
    }

    private static LocalDate date(ResultSet r, String column) throws SQLException {
        Date value = r.getDate(column);
        return value == null ? null : value.toLocalDate();
    }

    private boolean exists(String table, UUID id) {
        return id != null && db.queryForObject("select count(*) from " + table + " where owner_id=? and id=?", Integer.class, owner(), id) > 0;
    }

    private void owned(String table, UUID id, String message) {
        if (!exists(table, id)) throw new ResourceNotFoundException(message);
    }

    // ---------------------------------------------------------------- reads

    @Transactional(readOnly = true)
    public Catalog catalog() {
        UUID owner = owner();
        var identities = db.query("select * from checklist_sys_identities where owner_id=? order by sort_order, created_at, id",
                (r, n) -> new Identity(r.getObject("id", UUID.class), r.getString("name"), r.getString("description"), r.getString("color"), r.getInt("sort_order")), owner);
        var areas = db.query("select * from checklist_sys_areas where owner_id=? order by sort_order, created_at, id",
                (r, n) -> new Area(r.getObject("id", UUID.class), r.getObject("identity_id", UUID.class), r.getString("name"), r.getString("description"), r.getString("color"), r.getInt("sort_order")), owner);
        var items = db.query("select i.*, (select max(r.entry_date) from checklist_sys_records r where r.owner_id=i.owner_id and r.item_id=i.id) as last_record_on "
                        + "from checklist_sys_items i where i.owner_id=? order by i.sort_order, i.created_at, i.id",
                (r, n) -> new Item(r.getObject("id", UUID.class), r.getObject("area_id", UUID.class), r.getString("name"), r.getString("description"),
                        Importance.valueOf(r.getString("importance")), r.getString("icon"), r.getInt("sort_order"), date(r, "start_date"), date(r, "archived_on"), date(r, "last_record_on")), owner);
        var periods = db.query("select item_id, archived_on, restored_on from checklist_archive_periods where owner_id=? and domain=? order by archived_on, id",
                (r, n) -> new ArchivePeriod(r.getObject("item_id", UUID.class), date(r, "archived_on"), date(r, "restored_on")), owner, ARCHIVE_DOMAIN);
        return new Catalog(identities, areas, items, periods);
    }

    @Transactional(readOnly = true)
    public List<DailyRecord> records(LocalDate from, LocalDate to) {
        require(from != null && to != null && !to.isBefore(from) && ChronoUnit.DAYS.between(from, to) <= MAX_RANGE_DAYS, "조회 기간을 확인하세요.");
        return db.query("select item_id, entry_date, state from checklist_sys_records where owner_id=? and entry_date between ? and ? order by entry_date, item_id",
                (r, n) -> new DailyRecord(r.getObject("item_id", UUID.class), date(r, "entry_date"), RecordState.valueOf(r.getString("state"))),
                owner(), from, to);
    }

    // ------------------------------------------------------------ records

    /** Applies every change atomically, or none. A null state clears the cell. */
    public void saveRecords(RecordChanges input) {
        List<RecordChange> changes = input == null || input.changes() == null ? List.of() : input.changes();
        require(!changes.isEmpty() && changes.size() <= MAX_CHANGES, "변경할 기록을 1–" + MAX_CHANGES + "개 선택하세요.");
        require(changes.stream().allMatch(c -> c != null && c.itemId() != null && c.date() != null), "기록 항목과 날짜를 확인하세요.");
        Set<String> seen = new HashSet<>();
        require(changes.stream().allMatch(c -> seen.add(c.itemId() + "/" + c.date())), "같은 칸이 중복되었습니다.");
        LocalDate now = today.get();
        require(changes.stream().noneMatch(c -> c.date().isAfter(now)), "미래 날짜는 기록할 수 없습니다.");

        UUID owner = owner();
        Set<UUID> itemIds = new HashSet<>();
        changes.forEach(c -> itemIds.add(c.itemId()));
        Map<UUID, LocalDate> starts = new HashMap<>();
        Map<UUID, LocalDate> archived = new HashMap<>();
        String placeholders = String.join(",", Collections.nCopies(itemIds.size(), "?"));
        List<Object> args = new ArrayList<>();
        args.add(owner);
        args.addAll(itemIds);
        // FOR SHARE keeps start/archive state stable without serializing unrelated writes.
        db.query("select id, start_date, archived_on from checklist_sys_items where owner_id=? and id in (" + placeholders + ") for share", r -> {
            UUID id = r.getObject("id", UUID.class);
            starts.put(id, date(r, "start_date"));
            archived.put(id, date(r, "archived_on"));
        }, args.toArray());
        if (starts.size() != itemIds.size()) throw new ResourceNotFoundException("체크리스트 항목을 찾을 수 없습니다.");
        Map<UUID, List<ArchivePeriod>> periods = new HashMap<>();
        db.query("select item_id, archived_on, restored_on from checklist_archive_periods where owner_id=? and domain=? and item_id in (" + placeholders + ")", r -> {
            periods.computeIfAbsent(r.getObject("item_id", UUID.class), k -> new ArrayList<>())
                    .add(new ArchivePeriod(r.getObject("item_id", UUID.class), date(r, "archived_on"), date(r, "restored_on")));
        }, withDomain(args).toArray());

        for (RecordChange change : changes) {
            require(archived.get(change.itemId()) == null, "보관된 항목은 기록할 수 없습니다. 먼저 복원하세요.");
            require(!change.date().isBefore(starts.get(change.itemId())), "항목 시작일 이전에는 기록할 수 없습니다.");
            require(!inArchive(periods.getOrDefault(change.itemId(), List.of()), change.date()), "보관 기간의 날짜는 기록할 수 없습니다.");
        }

        List<Object[]> clears = new ArrayList<>();
        List<Object[]> upserts = new ArrayList<>();
        for (RecordChange change : changes) {
            if (change.state() == null) clears.add(new Object[]{owner, change.itemId(), change.date()});
            else upserts.add(new Object[]{owner, change.itemId(), change.date(), change.state().name()});
        }
        if (!clears.isEmpty()) {
            db.batchUpdate("delete from checklist_sys_records where owner_id=? and item_id=? and entry_date=?", clears);
        }
        if (!upserts.isEmpty()) {
            db.batchUpdate("insert into checklist_sys_records(owner_id,item_id,entry_date,state) values(?,?,?,?) "
                    + "on conflict(owner_id,item_id,entry_date) do update set state=excluded.state, updated_at=now()", upserts);
        }
    }

    private static List<Object> withDomain(List<Object> ownerAndIds) {
        List<Object> result = new ArrayList<>();
        result.add(ownerAndIds.getFirst());
        result.add(ARCHIVE_DOMAIN);
        result.addAll(ownerAndIds.subList(1, ownerAndIds.size()));
        return result;
    }

    static boolean inArchive(List<ArchivePeriod> periods, LocalDate date) {
        return periods.stream().anyMatch(p -> !date.isBefore(p.archivedOn()) && (p.restoredOn() == null || date.isBefore(p.restoredOn())));
    }

    // ------------------------------------------------------------ catalog

    public void saveIdentity(UUID id, Identity input) {
        same(id, input.id());
        String name = text(input.name(), 100, true);
        String description = text(input.description(), 500, false);
        String color = color(input.color());
        lock();
        if (exists("checklist_sys_identities", id)) {
            db.update("update checklist_sys_identities set name=?, description=?, color=?, updated_at=now() where owner_id=? and id=?", name, description, color, owner(), id);
        } else {
            require(!db.queryForObject("select exists(select 1 from checklist_sys_identities where id=?)", Boolean.class, id), "요청 ID를 사용할 수 없습니다.");
            db.update("insert into checklist_sys_identities(id,owner_id,name,description,color,sort_order) values(?,?,?,?,?,?)",
                    id, owner(), name, description, color, nextOrder("checklist_sys_identities", null, null));
        }
    }

    public void deleteIdentity(UUID id) {
        lock();
        owned("checklist_sys_identities", id, "Identity를 찾을 수 없습니다.");
        int areas = db.queryForObject("select count(*) from checklist_sys_areas where owner_id=? and identity_id=?", Integer.class, owner(), id);
        require(areas == 0, "Area가 있는 Identity는 삭제할 수 없습니다. Area를 먼저 정리하세요.");
        db.update("delete from checklist_sys_identities where owner_id=? and id=?", owner(), id);
    }

    public void saveArea(UUID id, Area input) {
        same(id, input.id());
        String name = text(input.name(), 100, true);
        String description = text(input.description(), 500, false);
        String color = color(input.color());
        lock();
        owned("checklist_sys_identities", input.identityId(), "Identity를 찾을 수 없습니다.");
        var current = db.queryForList("select identity_id from checklist_sys_areas where owner_id=? and id=?", UUID.class, owner(), id);
        if (!current.isEmpty()) {
            boolean moved = !current.getFirst().equals(input.identityId());
            db.update("update checklist_sys_areas set identity_id=?, name=?, description=?, color=?, updated_at=now()"
                            + (moved ? ", sort_order=" + nextOrder("checklist_sys_areas", "identity_id", input.identityId()) : "")
                            + " where owner_id=? and id=?",
                    input.identityId(), name, description, color, owner(), id);
        } else {
            require(!db.queryForObject("select exists(select 1 from checklist_sys_areas where id=?)", Boolean.class, id), "요청 ID를 사용할 수 없습니다.");
            db.update("insert into checklist_sys_areas(id,owner_id,identity_id,name,description,color,sort_order) values(?,?,?,?,?,?,?)",
                    id, owner(), input.identityId(), name, description, color, nextOrder("checklist_sys_areas", "identity_id", input.identityId()));
        }
    }

    public void deleteArea(UUID id) {
        lock();
        owned("checklist_sys_areas", id, "Area를 찾을 수 없습니다.");
        int items = db.queryForObject("select count(*) from checklist_sys_items where owner_id=? and area_id=?", Integer.class, owner(), id);
        require(items == 0, "항목(보관 항목 포함)이 있는 Area는 삭제할 수 없습니다.");
        db.update("delete from checklist_sys_areas where owner_id=? and id=?", owner(), id);
    }

    public void saveItem(UUID id, Item input) {
        same(id, input.id());
        String name = text(input.name(), 200, true);
        String description = text(input.description(), 2000, false);
        require(input.importance() != null, "중요도를 선택하세요.");
        require(input.icon() != null && input.icon().matches("[a-z0-9-]{1,40}"), "아이콘을 선택하세요.");
        require(input.startDate() != null && !input.startDate().isAfter(today.get().plusYears(1)), "기록 시작일을 확인하세요.");
        lock();
        owned("checklist_sys_areas", input.areaId(), "Area를 찾을 수 없습니다.");
        var current = db.queryForList("select area_id from checklist_sys_items where owner_id=? and id=?", UUID.class, owner(), id);
        if (!current.isEmpty()) {
            LocalDate earliest = db.queryForObject("select min(entry_date) from checklist_sys_records where owner_id=? and item_id=?", LocalDate.class, owner(), id);
            require(earliest == null || !input.startDate().isAfter(earliest), "기존 기록보다 늦은 시작일로 바꿀 수 없습니다.");
            boolean moved = !current.getFirst().equals(input.areaId());
            db.update("update checklist_sys_items set area_id=?, name=?, description=?, importance=?, icon=?, start_date=?, updated_at=now()"
                            + (moved ? ", sort_order=" + nextOrder("checklist_sys_items", "area_id", input.areaId()) : "")
                            + " where owner_id=? and id=?",
                    input.areaId(), name, description, input.importance().name(), input.icon(), input.startDate(), owner(), id);
        } else {
            require(!db.queryForObject("select exists(select 1 from checklist_sys_items where id=?)", Boolean.class, id), "요청 ID를 사용할 수 없습니다.");
            db.update("insert into checklist_sys_items(id,owner_id,area_id,name,description,importance,icon,sort_order,start_date) values(?,?,?,?,?,?,?,?,?)",
                    id, owner(), input.areaId(), name, description, input.importance().name(), input.icon(),
                    nextOrder("checklist_sys_items", "area_id", input.areaId()), input.startDate());
        }
    }

    /** Delete = archive: hidden from active views, history and identity preserved. */
    public void archiveItem(UUID id) {
        lock();
        owned("checklist_sys_items", id, "체크리스트 항목을 찾을 수 없습니다.");
        LocalDate now = today.get();
        int changed = db.update("update checklist_sys_items set archived_on=?, updated_at=now() where owner_id=? and id=? and archived_on is null", now, owner(), id);
        if (changed == 0) return;
        db.update("insert into checklist_archive_periods(id,owner_id,domain,item_id,archived_on) values(?,?,?,?,?)",
                UUID.randomUUID(), owner(), ARCHIVE_DOMAIN, id, now);
    }

    /** Restores the same item identity; recording continues from today. */
    public void restoreItem(UUID id) {
        lock();
        owned("checklist_sys_items", id, "체크리스트 항목을 찾을 수 없습니다.");
        LocalDate now = today.get();
        int changed = db.update("update checklist_sys_items set archived_on=null, updated_at=now() where owner_id=? and id=? and archived_on is not null", owner(), id);
        if (changed == 0) return;
        db.update("update checklist_archive_periods set restored_on=greatest(archived_on, ?) where owner_id=? and domain=? and item_id=? and restored_on is null",
                now, owner(), ARCHIVE_DOMAIN, id);
    }

    public void orderIdentities(OrderInput input) {
        reorder("checklist_sys_identities", null, null, input);
    }

    public void orderAreas(OrderInput input) {
        lock();
        owned("checklist_sys_identities", input.parentId(), "Identity를 찾을 수 없습니다.");
        reorder("checklist_sys_areas", "identity_id", input.parentId(), input);
    }

    /**
     * Moves an Area to another (or the same) Identity and applies the target group's
     * order in one transaction. Only the Area's owner and position change: its id,
     * items and recorded history stay attached, so nothing is cloned or recreated.
     */
    public void moveArea(UUID id, OrderInput input) {
        require(input != null && input.parentId() != null && input.ids() != null && input.ids().contains(id), "이동할 Area와 대상 Identity 순서를 확인하세요.");
        lock();
        owned("checklist_sys_areas", id, "Area를 찾을 수 없습니다.");
        owned("checklist_sys_identities", input.parentId(), "Identity를 찾을 수 없습니다.");
        // Validate the whole target order before writing, so a rejected move changes nothing.
        Set<UUID> targets = new HashSet<>(db.queryForList("select id from checklist_sys_areas where owner_id=? and identity_id=?", UUID.class, owner(), input.parentId()));
        targets.add(id);
        require(new HashSet<>(input.ids()).size() == input.ids().size() && targets.containsAll(input.ids()), "대상 Identity의 Area 순서를 확인하세요.");
        db.update("update checklist_sys_areas set identity_id=?, updated_at=now() where owner_id=? and id=?", input.parentId(), owner(), id);
        reorder("checklist_sys_areas", "identity_id", input.parentId(), input);
    }

    public void orderItems(OrderInput input) {
        lock();
        owned("checklist_sys_areas", input.parentId(), "Area를 찾을 수 없습니다.");
        reorder("checklist_sys_items", "area_id", input.parentId(), input);
    }

    /** Reorders the given sibling subset in place; other siblings keep their slots. */
    private void reorder(String table, String parentColumn, UUID parentId, OrderInput input) {
        List<UUID> ids = input == null || input.ids() == null ? List.of() : input.ids();
        require(ids.size() <= 5000 && ids.stream().noneMatch(Objects::isNull) && new HashSet<>(ids).size() == ids.size(), "정렬 ID를 중복 없이 입력하세요.");
        lock();
        List<UUID> all = parentColumn == null
                ? db.queryForList("select id from " + table + " where owner_id=? order by sort_order, created_at, id", UUID.class, owner())
                : db.queryForList("select id from " + table + " where owner_id=? and " + parentColumn + "=? order by sort_order, created_at, id", UUID.class, owner(), parentId);
        if (!all.containsAll(ids)) throw new ResourceNotFoundException("정렬 대상을 찾을 수 없습니다.");
        Set<UUID> selected = new HashSet<>(ids);
        Iterator<UUID> next = ids.iterator();
        List<Object[]> updates = new ArrayList<>();
        for (int i = 0; i < all.size(); i++) {
            UUID id = selected.contains(all.get(i)) ? next.next() : all.get(i);
            updates.add(new Object[]{i, owner(), id});
        }
        db.batchUpdate("update " + table + " set sort_order=? where owner_id=? and id=?", updates);
    }

    // Table/column names are internal constants, never request input.
    private int nextOrder(String table, String parentColumn, UUID parentId) {
        Integer max = parentColumn == null
                ? db.queryForObject("select max(sort_order) from " + table + " where owner_id=?", Integer.class, owner())
                : db.queryForObject("select max(sort_order) from " + table + " where owner_id=? and " + parentColumn + "=?", Integer.class, owner(), parentId);
        return max == null ? 0 : max + 1;
    }
}
