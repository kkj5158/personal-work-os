package com.kafka.backend.log;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.shareddesk.storage.*;
import java.io.ByteArrayOutputStream;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * All mutations serialize per POS owner. Revisions protect edits made on another device. Every
 * identifier lookup includes BOTH owner and profile; DB composite FKs enforce the same boundary.
 */
@Service
public class LogService {
  final JdbcTemplate db;
  final CurrentUserProvider users;
  final LogStorage storage;
  final TransactionTemplate tx;
  static final long MAX_IMAGE_BYTES = 18L * 1024 * 1024;

  @org.springframework.beans.factory.annotation.Value("${LOG_MAX_IMAGES_PER_POST:20}")
  int configuredMaxImagesPerPost = 20;

  int maxImagesPerPost() {
    return Math.clamp(configuredMaxImagesPerPost, 1, 100);
  }

  public LogService(
      JdbcTemplate db,
      CurrentUserProvider users,
      LogStorage storage,
      PlatformTransactionManager manager) {
    this.db = db;
    this.users = users;
    this.storage = storage;
    this.tx = new TransactionTemplate(manager);
  }

  UUID owner() {
    return users.getCurrentUserId();
  }

  <T> T locked(UUID owner, Supplier<T> work) {
    return tx.execute(status -> {
      db.update(
          "insert into log_workspaces(owner_id) values(?) on conflict(owner_id) do nothing", owner);
      db.queryForObject(
          "select owner_id from log_workspaces where owner_id=? for update", UUID.class, owner);
      return work.get();
    });
  }

  static LogException error(int status, String message) {
    return new LogException(status, message);
  }

  static UUID uuid(Object value) {
    try {
      return UUID.fromString(String.valueOf(value));
    } catch (RuntimeException e) {
      throw error(400, "올바른 기록 ID가 아닙니다.");
    }
  }

  static String text(Map<String, Object> body, String name, int max, boolean required) {
    Object value = body.get(name);
    if (value != null && !(value instanceof String)) throw error(400, "입력 형식을 확인해주세요.");
    String text = value == null ? "" : (String) value;
    if (text.length() > max || text.indexOf('\0') >= 0 || (required && text.isBlank()))
      throw error(400, "입력 길이와 필수 항목을 확인해주세요.");
    return text;
  }

  static long number(Object value) {
    if (!(value instanceof Number n)) throw error(400, "버전·크기를 확인해주세요.");
    try {
      long result = new java.math.BigDecimal(n.toString()).longValueExact();
      if (result < 0) throw new ArithmeticException();
      return result;
    } catch (ArithmeticException | NumberFormatException invalid) {
      throw error(400, "버전·크기를 확인해주세요.");
    }
  }

  static Instant date(Object value) {
    if (value == null) return Instant.now();
    try {
      Instant d =
          value instanceof Number n
              ? Instant.ofEpochMilli(n.longValue())
              : Instant.parse(value.toString());
      if (d.isBefore(Instant.parse("1900-01-01T00:00:00Z"))
          || d.isAfter(Instant.now().plusSeconds(86400))) throw new IllegalArgumentException();
      return d;
    } catch (RuntimeException e) {
      throw error(400, "기록 날짜를 확인해주세요.");
    }
  }

  Map<String, Object> one(String sql, Object... args) {
    var rows = db.queryForList(sql, args);
    if (rows.isEmpty()) throw error(404, "기록을 찾을 수 없습니다.");
    return rows.getFirst();
  }

  Map<String, Object> profile(UUID o, UUID p) {
    return one("select * from log_profiles where owner_id=? and id=? and deleted_at is null", o, p);
  }

  Map<String, Object> post(UUID o, UUID p, UUID id) {
    profile(o, p);
    return one("select * from log_posts where owner_id=? and profile_id=? and id=?", o, p, id);
  }

  static void revision(Map<String, Object> row, Map<String, Object> b) {
    if (number(b.get("revision")) != ((Number) row.get("revision")).longValue())
      throw error(409, "다른 기기에서 변경된 기록입니다. 입력을 복사한 뒤 새로고침해주세요.");
  }

  List<UUID> images(UUID o, UUID p, Map<String, Object> b) {
    Object raw = b.getOrDefault("images", List.of());
    if (!(raw instanceof List<?> arr) || arr.size() > maxImagesPerPost())
      throw error(400, "사진은 최대 " + maxImagesPerPost() + "장까지 첨부할 수 있습니다.");
    var ids = arr.stream().map(LogService::uuid).toList();
    if (new HashSet<>(ids).size() != ids.size()) throw error(400, "중복 사진을 확인해주세요.");
    for (UUID id : ids)
      one(
          "select id from log_images where owner_id=? and profile_id=? and id=? and state='READY'",
          o,
          p,
          id);
    return ids;
  }

  Map<String, Object> profileView(Map<String, Object> r) {
    var result = new LinkedHashMap<String, Object>();
    result.put("id", r.get("id"));
    result.put("name", r.get("name"));
    result.put("handle", r.get("handle"));
    result.put("bio", r.get("bio"));
    result.put("avatar", r.get("avatar_id"));
    result.put("revision", r.get("revision"));
    return result;
  }

  public Map<String, Object> state() {
    UUID o = owner();
    var profiles =
        db
            .queryForList(
                "select * from log_profiles where owner_id=? and deleted_at is null order by"
                    + " created_at,id",
                o)
            .stream()
            .map(this::profileView)
            .toList();
    var rows = db.queryForList("select active_profile_id from log_workspaces where owner_id=?", o);
    var result = new LinkedHashMap<String, Object>();
    result.put("ownerId", o);
    result.put("profiles", profiles);
    result.put("activeProfileId", rows.isEmpty() ? null : rows.getFirst().get("active_profile_id"));
    result.put("storageEnabled", storage.objects.enabled());
    result.put("maxImagesPerPost", maxImagesPerPost());
    result.put("maxImageBytes", MAX_IMAGE_BYTES);
    return result;
  }

  public Map<String, Object> createProfile(Map<String, Object> b) {
    UUID o = owner(), id = uuid(b.get("id"));
    return locked(
        o,
        () -> {
          var existing =
              db.queryForList(
                  "select * from log_profiles where owner_id=? and id=? and deleted_at is null",
                  o,
                  id);
          if (!existing.isEmpty()) return profileView(existing.getFirst());
          if (db.queryForObject(
                  "select count(*) from log_profiles where owner_id=? and deleted_at is null",
                  Integer.class,
                  o)
              >= 30) throw error(400, "프로필은 최대 30개입니다.");
          String name = text(b, "name", 40, true).strip(),
              handle = handle(o, id, b),
              bio = text(b, "bio", 300, false);
          db.update(
              "insert into log_profiles(id,owner_id,name,handle,bio) values(?,?,?,?,?)",
              id,
              o,
              name,
              handle,
              bio);
          db.update("insert into log_drafts(owner_id,profile_id) values(?,?)", o, id);
          db.update(
              "update log_workspaces set active_profile_id=coalesce(active_profile_id,?) where"
                  + " owner_id=?",
              id,
              o);
          return profileView(profile(o, id));
        });
  }

  String handle(UUID o, UUID p, Map<String, Object> b) {
    String handle = text(b, "handle", 32, true).strip().replaceFirst("^@", "");
    if (!handle.matches("[a-zA-Z0-9_.가-힣]{1,32}"))
      throw error(400, "사용자 이름은 문자·숫자·점·밑줄만 사용할 수 있습니다.");
    if (db.queryForObject(
            "select count(*) from log_profiles where owner_id=? and lower(handle)=lower(?) and"
                + " id<>?",
            Integer.class,
            o,
            handle,
            p)
        > 0) throw error(409, "이미 사용 중인 사용자 이름입니다.");
    return handle;
  }

  public Map<String, Object> updateProfile(UUID p, Map<String, Object> b) {
    UUID o = owner();
    return locked(
        o,
        () -> {
          var r = profile(o, p);
          revision(r, b);
          UUID avatar = b.get("avatar") == null ? null : uuid(b.get("avatar"));
          if (avatar != null)
            one(
                "select id from log_images where owner_id=? and profile_id=? and id=? and"
                    + " state='READY'",
                o,
                p,
                avatar);
          db.update(
              "update log_profiles set name=?,handle=?,bio=?,avatar_id=?,revision=revision+1 where"
                  + " owner_id=? and id=?",
              text(b, "name", 40, true).strip(),
              handle(o, p, b),
              text(b, "bio", 300, false),
              avatar,
              o,
              p);
          return profileView(profile(o, p));
        });
  }

  public Map<String, Object> activate(UUID p) {
    UUID o = owner();
    return locked(
        o,
        () -> {
          profile(o, p);
          db.update("update log_workspaces set active_profile_id=? where owner_id=?", p, o);
          return state();
        });
  }

  public Map<String, Object> deleteProfile(UUID p, Map<String, Object> b) {
    UUID o = owner();
    return locked(
        o,
        () -> {
          var r = profile(o, p);
          revision(r, b);
          if (!Boolean.TRUE.equals(b.get("confirm"))) throw error(400, "프로필 삭제 확인이 필요합니다.");
          var rest =
              db.queryForList(
                  "select id from log_profiles where owner_id=? and deleted_at is null and id<>?"
                      + " order by created_at,id",
                  o,
                  p);
          if (rest.isEmpty()) throw error(409, "마지막 프로필은 삭제할 수 없습니다. 새 프로필을 먼저 추가해주세요.");
          db.update(
              "update log_workspaces set active_profile_id=? where owner_id=? and"
                  + " active_profile_id=?",
              rest.getFirst().get("id"),
              o,
              p);
          db.update(
              "update log_profiles set deleted_at=current_timestamp,revision=revision+1 where"
                  + " owner_id=? and id=?",
              o,
              p);
          return state();
        });
  }

  List<UUID> postImages(UUID o, UUID p, UUID id) {
    return db.queryForList(
        "select image_id from log_post_images where owner_id=? and profile_id=? and post_id=? order"
            + " by position",
        UUID.class,
        o,
        p,
        id);
  }

  static Object millis(Object value) {
    return value instanceof Timestamp ts
        ? ts.getTime()
        : value instanceof java.time.OffsetDateTime d ? d.toInstant().toEpochMilli() : value;
  }

  Map<String, Object> replyView(Map<String, Object> r) {
    var v = new LinkedHashMap<String, Object>();
    for (String key : List.of("id", "text", "revision")) v.put(key, r.get(key));
    v.put("createdAt", millis(r.get("created_at")));
    v.put("updatedAt", millis(r.get("updated_at")));
    return v;
  }

  Map<String, Object> postView(UUID o, UUID p, Map<String, Object> r) {
    var v = new LinkedHashMap<String, Object>();
    for (String key : List.of("id", "text", "revision", "liked", "saved", "pinned", "archived"))
      v.put(key, r.get(key));
    for (var key :
        Map.of("createdAt", "created_at", "updatedAt", "updated_at", "repostedAt", "reposted_at")
            .entrySet()) v.put(key.getKey(), millis(r.get(key.getValue())));
    UUID id = (UUID) r.get("id");
    v.put("images", postImages(o, p, id));
    v.put(
        "replyCount",
        db.queryForObject(
            "select count(*) from log_replies where owner_id=? and profile_id=? and post_id=?",
            Integer.class,
            o,
            p,
            id));
    v.put(
        "replies",
        db
            .queryForList(
                "select * from log_replies where owner_id=? and profile_id=? and post_id=? order by"
                    + " created_at,id limit 3",
                o,
                p,
                id)
            .stream()
            .map(this::replyView)
            .toList());
    return v;
  }

  public Map<String, Object> feed(UUID p, String filter, String query, int offset, int limit) {
    UUID o = owner();
    profile(o, p);
    if (offset < 0 || offset > 1000000 || limit < 1 || limit > 50 || query.length() > 200)
      throw error(400, "검색 범위를 확인해주세요.");
    String clause =
        switch (filter) {
          case "threads" -> "not archived";
          case "media" ->
              "not archived and exists(select 1 from log_post_images m where"
                  + " m.post_id=log_posts.id)";
          case "replies" ->
              "not archived and exists(select 1 from log_replies r where r.post_id=log_posts.id)";
          case "reposts" -> "not archived and reposted_at is not null";
          case "saved" -> "not archived and saved";
          case "liked" -> "not archived and liked";
          case "archive" -> "archived";
          default -> throw error(400, "보기 항목을 확인해주세요.");
        };
    String where =
        " where owner_id=? and profile_id=? and "
            + clause
            + " and (position(lower(?) in lower(text))>0 or exists(select 1 from log_replies r"
            + " where r.post_id=log_posts.id and position(lower(?) in lower(r.text))>0))";
    var rows =
        db.queryForList(
            "select * from log_posts"
                + where
                + " order by pinned desc,created_at desc,id limit ? offset ?",
            o,
            p,
            query,
            query,
            limit + 1,
            offset);
    boolean more = rows.size() > limit;
    var result = new LinkedHashMap<String, Object>();
    result.put("posts", rows.stream().limit(limit).map(r -> postView(o, p, r)).toList());
    result.put("nextOffset", more ? offset + limit : null);
    result.put(
        "total",
        db.queryForObject(
            "select count(*) from log_posts" + where, Integer.class, o, p, query, query));
    result.put("stats", stats(o, p));
    return result;
  }

  Map<String, Object> stats(UUID o, UUID p) {
    return Map.of(
        "posts",
        db.queryForObject(
            "select count(*) from log_posts where owner_id=? and profile_id=? and not archived",
            Integer.class,
            o,
            p),
        "replies",
        db.queryForObject(
            "select count(*) from log_replies r join log_posts p on r.post_id=p.id where"
                + " r.owner_id=? and r.profile_id=? and not p.archived",
            Integer.class,
            o,
            p),
        "media",
        db.queryForObject(
            "select count(*) from log_post_images m join log_posts p on m.post_id=p.id where"
                + " m.owner_id=? and m.profile_id=? and not p.archived",
            Integer.class,
            o,
            p),
        "liked",
        db.queryForObject(
            "select count(*) from log_posts where owner_id=? and profile_id=? and liked and not"
                + " archived",
            Integer.class,
            o,
            p),
        "days",
        db
            .queryForList(
                "select cast(created_at as date) as day,count(*) as count from log_posts where"
                    + " owner_id=? and profile_id=? and not archived and"
                    + " created_at>=current_timestamp-interval '7 days' group by cast(created_at as"
                    + " date) order by day",
                o,
                p)
            .stream()
            .map(r -> Map.of("day", r.get("day").toString(), "count", r.get("count")))
            .toList());
  }

  public Map<String, Object> getPost(UUID p, UUID id) {
    UUID o = owner();
    return postView(o, p, post(o, p, id));
  }

  void setPostImages(UUID o, UUID p, UUID id, List<UUID> images) {
    db.update(
        "delete from log_post_images where owner_id=? and profile_id=? and post_id=?", o, p, id);
    for (int i = 0; i < images.size(); i++)
      db.update(
          "insert into log_post_images(owner_id,profile_id,post_id,image_id,position)"
              + " values(?,?,?,?,?)",
          o,
          p,
          id,
          images.get(i),
          i);
  }

  public Map<String, Object> createPost(UUID p, Map<String, Object> b) {
    UUID o = owner(), id = uuid(b.get("id"));
    return locked(
        o,
        () -> {
          profile(o, p);
          var existing =
              db.queryForList(
                  "select * from log_posts where owner_id=? and profile_id=? and id=?", o, p, id);
          if (!existing.isEmpty()) return postView(o, p, existing.getFirst());
          String text = text(b, "text", 50000, false);
          var images = images(o, p, b);
          if (text.isBlank() && images.isEmpty()) throw error(400, "글 또는 사진을 추가해주세요.");
          db.update(
              "insert into log_posts(id,owner_id,profile_id,text,created_at,legacy_key)"
                  + " values(?,?,?,?,?,?)",
              id,
              o,
              p,
              text,
              Timestamp.from(date(b.get("createdAt"))),
              b.get("legacyKey") == null ? null : text(b, "legacyKey", 180, true));
          setPostImages(o, p, id, images);
          if (b.get("legacyKey") != null) {
            // One imported record, its flags and its discussion commit together. A retry returns it
            // unchanged.
            Object replies = b.getOrDefault("replies", List.of());
            if (!(replies instanceof List<?> list) || list.size() > 5000)
              throw error(400, "백업 답글 목록을 확인해주세요.");
            db.update(
                "update log_posts set"
                    + " liked=?,saved=?,pinned=?,archived=?,reposted_at=?,updated_at=? where"
                    + " owner_id=? and profile_id=? and id=?",
                Boolean.TRUE.equals(b.get("liked")),
                Boolean.TRUE.equals(b.get("saved")),
                Boolean.TRUE.equals(b.get("pinned")),
                Boolean.TRUE.equals(b.get("archived")),
                b.get("repostedAt") == null ? null : Timestamp.from(date(b.get("repostedAt"))),
                b.get("updatedAt") == null ? null : Timestamp.from(date(b.get("updatedAt"))),
                o,
                p,
                id);
            for (Object raw : list) {
              if (!(raw instanceof Map<?, ?> map)) throw error(400, "백업 답글 형식을 확인해주세요.");
              Map<String, Object> reply = new HashMap<>();
              for (var e : map.entrySet()) {
                if (!(e.getKey() instanceof String key)) throw error(400, "백업 답글을 확인해주세요.");
                reply.put(key, e.getValue());
              }
              db.update(
                  "insert into"
                      + " log_replies(id,owner_id,profile_id,post_id,text,created_at,updated_at)"
                      + " values(?,?,?,?,?,?,?)",
                  uuid(reply.get("id")),
                  o,
                  p,
                  id,
                  text(reply, "text", 3000, true),
                  Timestamp.from(date(reply.get("createdAt"))),
                  reply.get("updatedAt") == null
                      ? null
                      : Timestamp.from(date(reply.get("updatedAt"))));
            }
          }
          if (b.get("draftRevision") != null) {
            var d = draftRow(o, p);
            revision(d, Map.of("revision", b.get("draftRevision")));
            db.update("delete from log_draft_images where owner_id=? and profile_id=?", o, p);
            db.update(
                "update log_drafts set text='',revision=revision+1,updated_at=current_timestamp"
                    + " where owner_id=? and profile_id=?",
                o,
                p);
          }
          return postView(o, p, post(o, p, id));
        });
  }

  public Map<String, Object> updatePost(UUID p, UUID id, Map<String, Object> b) {
    UUID o = owner();
    return locked(
        o,
        () -> {
          var row = post(o, p, id);
          String text = text(b, "text", 50000, false);
          var images = b.containsKey("images") ? images(o, p, b) : postImages(o, p, id);
          // Equivalent retry after a lost response acknowledges the already persisted edit.
          if (number(b.get("revision")) + 1 == ((Number) row.get("revision")).longValue()
              && text.equals(row.get("text"))
              && images.equals(postImages(o, p, id))) return postView(o, p, row);
          revision(row, b);
          if (text.isBlank() && images.isEmpty()) throw error(400, "글 또는 사진을 남겨주세요.");
          db.update(
              "update log_posts set text=?,revision=revision+1,updated_at=current_timestamp where"
                  + " owner_id=? and profile_id=? and id=?",
              text,
              o,
              p,
              id);
          setPostImages(o, p, id, images);
          return postView(o, p, post(o, p, id));
        });
  }

  public Map<String, Object> action(UUID p, UUID id, Map<String, Object> b) {
    UUID o = owner();
    return locked(
        o,
        () -> {
          var row = post(o, p, id);
          revision(row, b);
          String action = text(b, "action", 20, true);
          if (!(b.get("value") instanceof Boolean value)) throw error(400, "변경 상태를 확인해주세요.");
          if (Set.of("liked", "saved", "pinned", "archived").contains(action))
            db.update(
                "update log_posts set "
                    + action
                    + "=?,revision=revision+1 where owner_id=? and profile_id=? and id=?",
                value,
                o,
                p,
                id);
          else if (action.equals("reposted"))
            db.update(
                "update log_posts set reposted_at=?,revision=revision+1 where owner_id=? and"
                    + " profile_id=? and id=?",
                value ? Timestamp.from(Instant.now()) : null,
                o,
                p,
                id);
          else throw error(400, "지원하지 않는 동작입니다.");
          return postView(o, p, post(o, p, id));
        });
  }

  public void deletePost(UUID p, UUID id, Map<String, Object> b) {
    UUID o = owner();
    locked(
        o,
        () -> {
          revision(post(o, p, id), b);
          if (!Boolean.TRUE.equals(b.get("confirm"))) throw error(400, "삭제 확인이 필요합니다.");
          db.update("delete from log_posts where owner_id=? and profile_id=? and id=?", o, p, id);
          return null;
        });
  }

  public Map<String, Object> replies(UUID p, UUID id, int offset) {
    UUID o = owner();
    post(o, p, id);
    if (offset < 0 || offset > 100000) throw error(400, "답글 범위를 확인해주세요.");
    var rows =
        db.queryForList(
            "select * from log_replies where owner_id=? and profile_id=? and post_id=? order by"
                + " created_at,id limit 51 offset ?",
            o,
            p,
            id,
            offset);
    var v = new LinkedHashMap<String, Object>();
    v.put("replies", rows.stream().limit(50).map(this::replyView).toList());
    v.put("nextOffset", rows.size() > 50 ? offset + 50 : null);
    return v;
  }

  public Map<String, Object> createReply(UUID p, UUID postId, Map<String, Object> b) {
    UUID o = owner(), id = uuid(b.get("id"));
    return locked(
        o,
        () -> {
          post(o, p, postId);
          var existing =
              db.queryForList(
                  "select * from log_replies where owner_id=? and profile_id=? and post_id=? and"
                      + " id=?",
                  o,
                  p,
                  postId,
                  id);
          if (!existing.isEmpty()) return replyView(existing.getFirst());
          if (db.queryForObject(
                  "select count(*) from log_replies where owner_id=? and profile_id=? and"
                      + " post_id=?",
                  Integer.class,
                  o,
                  p,
                  postId)
              >= 5000) throw error(400, "이 기록의 답글 한도에 도달했습니다.");
          db.update(
              "insert into log_replies(id,owner_id,profile_id,post_id,text,created_at)"
                  + " values(?,?,?,?,?,?)",
              id,
              o,
              p,
              postId,
              text(b, "text", 3000, true),
              Timestamp.from(date(b.get("createdAt"))));
          return replyView(
              one(
                  "select * from log_replies where owner_id=? and profile_id=? and id=?",
                  o,
                  p,
                  id));
        });
  }

  public Map<String, Object> replyFeed(UUID p, int offset, int limit) {
    UUID o = owner();
    profile(o, p);
    if (offset < 0 || offset > 1000000 || limit < 1 || limit > 50)
      throw error(400, "답글 범위를 확인해주세요.");
    var rows =
        db.queryForList(
            "select r.* from log_replies r join log_posts p on r.post_id=p.id where r.owner_id=?"
                + " and r.profile_id=? and not p.archived order by r.created_at desc,r.id limit ?"
                + " offset ?",
            o,
            p,
            limit + 1,
            offset);
    var result = new LinkedHashMap<String, Object>();
    result.put("posts", List.of());
    result.put(
        "replyEntries",
        rows.stream()
            .limit(limit)
            .map(r ->
                Map.of(
                    "reply",
                    replyView(r),
                    "post",
                    postView(o, p, post(o, p, (UUID) r.get("post_id")))))
            .toList());
    result.put("nextOffset", rows.size() > limit ? offset + limit : null);
    result.put("total", stats(o, p).get("replies"));
    result.put("stats", stats(o, p));
    return result;
  }

  public Map<String, Object> updateReply(
      UUID p, UUID postId, UUID id, Map<String, Object> b, boolean delete) {
    UUID o = owner();
    return locked(
        o,
        () -> {
          post(o, p, postId);
          var row =
              one(
                  "select * from log_replies where owner_id=? and profile_id=? and post_id=? and"
                      + " id=?",
                  o,
                  p,
                  postId,
                  id);
          revision(row, b);
          if (delete) {
            if (!Boolean.TRUE.equals(b.get("confirm"))) throw error(400, "삭제 확인이 필요합니다.");
            db.update(
                "delete from log_replies where owner_id=? and profile_id=? and post_id=? and id=?",
                o,
                p,
                postId,
                id);
            return Map.of("deleted", true);
          }
          db.update(
              "update log_replies set text=?,revision=revision+1,updated_at=current_timestamp where"
                  + " owner_id=? and profile_id=? and post_id=? and id=?",
              text(b, "text", 3000, true),
              o,
              p,
              postId,
              id);
          return replyView(
              one(
                  "select * from log_replies where owner_id=? and profile_id=? and id=?",
                  o,
                  p,
                  id));
        });
  }

  Map<String, Object> draftRow(UUID o, UUID p) {
    profile(o, p);
    return one("select * from log_drafts where owner_id=? and profile_id=?", o, p);
  }

  Map<String, Object> draftView(UUID o, UUID p) {
    var r = draftRow(o, p);
    return Map.of(
        "text",
        r.get("text"),
        "revision",
        r.get("revision"),
        "images",
        db.queryForList(
            "select image_id from log_draft_images where owner_id=? and profile_id=? order by"
                + " position",
            UUID.class,
            o,
            p));
  }

  public Map<String, Object> draft(UUID p) {
    return draftView(owner(), p);
  }

  public Map<String, Object> saveDraft(UUID p, Map<String, Object> b) {
    UUID o = owner();
    return locked(
        o,
        () -> {
          revision(draftRow(o, p), b);
          var images = images(o, p, b);
          String text = text(b, "text", 50000, false);
          db.update(
              "update log_drafts set text=?,revision=revision+1,updated_at=current_timestamp where"
                  + " owner_id=? and profile_id=?",
              text,
              o,
              p);
          db.update("delete from log_draft_images where owner_id=? and profile_id=?", o, p);
          for (int i = 0; i < images.size(); i++)
            db.update(
                "insert into log_draft_images(owner_id,profile_id,image_id,position)"
                    + " values(?,?,?,?)",
                o,
                p,
                images.get(i),
                i);
          return draftView(o, p);
        });
  }

  public Map<String, Object> ticket(UUID p, Map<String, Object> b) {
    UUID o = owner();
    return locked(
        o,
        () -> {
          profile(o, p);
          if (!storage.objects.enabled()) throw error(503, "사진 저장소를 사용할 수 없습니다.");
          String mime = text(b, "mime", 30, true);
          if (!Set.of("image/png", "image/jpeg", "image/webp").contains(mime))
            throw error(400, "PNG·JPEG·WebP 사진만 지원합니다.");
          long size = number(b.get("sizeBytes"));
          if (size < 1 || size > MAX_IMAGE_BYTES) throw error(413, "사진은 18MB 이하만 첨부할 수 있습니다.");
          String filename = text(b, "name", 180, true);
          FilePolicy.Claim claim;
          try {
            claim = new FilePolicy.Claim(filename, size, text(b, "sha256", 64, true), mime);
          } catch (StorageFailure invalid) {
            throw error(400, "사진 형식과 파일 이름을 확인해주세요.");
          }
          UUID id = uuid(b.get("id"));
          var existing = db.queryForList("select * from log_images where id=?", id);
          if (!existing.isEmpty()) {
            var image = existing.getFirst();
            if (!o.equals(image.get("owner_id")) || !p.equals(image.get("profile_id")))
              throw error(404, "사진을 찾을 수 없습니다.");
            if (!filename.equals(image.get("display_name"))
                || size != ((Number) image.get("size_bytes")).longValue()
                || !claim.sha256().equals(image.get("sha256"))
                || !mime.equals(image.get("mime")))
              throw error(409, "다른 사진에 사용된 전송 ID입니다. 다시 첨부해주세요.");
            if ("READY".equals(image.get("state"))) return Map.of("id", id, "ready", true);
            if (!"UPLOADING".equals(image.get("state"))
                || ((Timestamp) image.get("created_at"))
                    .toInstant()
                    .isBefore(Instant.now().minusSeconds(600)))
              throw error(410, "사진 전송 시간이 만료되었습니다. 다시 첨부해주세요.");
            return uploadTicket(o, id, image.get("staging_key").toString(), claim);
          }
          long total =
              db.queryForObject(
                  "select coalesce(sum(size_bytes),0) from log_images where owner_id=?",
                  Long.class,
                  o);
          if (total + size > 5L * 1024 * 1024 * 1024)
            throw error(413, "LOG 사진 저장 한도(5GB)에 도달했습니다.");
          if (db.queryForObject(
                  "select count(*) from log_images where owner_id=? and state='UPLOADING' and"
                      + " created_at>current_timestamp-interval '1 hour'",
                  Integer.class,
                  o)
              >= 100) throw error(429, "진행 중인 사진 전송이 많습니다. 잠시 후 다시 시도해주세요.");
          String staging = storage.objects.newStagingKey(o),
              finalKey = storage.objects.newFinalKey(o);
          var ticket = uploadTicket(o, id, staging, claim);
          db.update(
              "insert into"
                  + " log_images(id,owner_id,profile_id,display_name,size_bytes,sha256,mime,staging_key,final_key,state)"
                  + " values(?,?,?,?,?,?,?,?,?,'UPLOADING')",
              id,
              o,
              p,
              filename,
              size,
              claim.sha256(),
              mime,
              staging,
              finalKey);
          return ticket;
        });
  }

  Map<String, Object> uploadTicket(UUID o, UUID id, String staging, FilePolicy.Claim claim) {
    var signed = storage.objects.presignPut(o, staging, claim);
    return Map.of(
        "id",
        id,
        "url",
        signed.url().toString(),
        "headers",
        signed.requiredHeaders(),
        "expiresAt",
        signed.expiresAt().toString());
  }

  Map<String, Object> image(UUID o, UUID p, UUID id) {
    profile(o, p);
    return one("select * from log_images where owner_id=? and profile_id=? and id=?", o, p, id);
  }

  public void upload(UUID p, UUID id, byte[] bytes) {
    UUID o = owner();
    locked(
        o,
        () -> {
          var r = image(o, p, id);
          if ("READY".equals(r.get("state"))) {
            // A lost completion response may be retried, but READY assets are immutable.
            try {
              FilePolicy.verify(new java.io.ByteArrayInputStream(bytes), imageClaim(r));
            } catch (java.io.IOException invalid) {
              throw error(400, "사진을 읽지 못했습니다.");
            }
            return null;
          }
          if (!"UPLOADING".equals(r.get("state"))
              || ((Timestamp) r.get("created_at"))
                  .toInstant()
                  .isBefore(Instant.now().minusSeconds(600))) throw error(409, "사진 전송 상태를 확인해주세요.");
          var claim =
              new FilePolicy.Claim(
                  r.get("display_name").toString(),
                  ((Number) r.get("size_bytes")).longValue(),
                  r.get("sha256").toString(),
                  r.get("mime").toString());
          try {
            FilePolicy.verify(new java.io.ByteArrayInputStream(bytes), claim);
          } catch (java.io.IOException invalid) {
            throw error(400, "사진을 읽지 못했습니다.");
          }
          storage.objects.upload(
              o, r.get("staging_key").toString(), claim, new java.io.ByteArrayInputStream(bytes));
          return null;
        });
  }

  public Map<String, Object> complete(UUID p, UUID id) {
    UUID o = owner();
    return locked(
        o,
        () -> {
          var r = image(o, p, id);
          if ("READY".equals(r.get("state"))) return Map.of("id", id, "ready", true);
          if (!"UPLOADING".equals(r.get("state"))
              || ((Timestamp) r.get("created_at"))
                  .toInstant()
                  .isBefore(Instant.now().minusSeconds(600)))
            throw error(410, "사진 전송 시간이 만료되었습니다. 다시 첨부해주세요.");
          var verified =
              storage.objects.promoteAndVerify(
                  o,
                  r.get("staging_key").toString(),
                  r.get("final_key").toString(),
                  new FilePolicy.Claim(
                      r.get("display_name").toString(),
                      ((Number) r.get("size_bytes")).longValue(),
                      r.get("sha256").toString(),
                      r.get("mime").toString()));
          if (!verified.detectedMime().equals(r.get("mime"))) throw error(400, "사진 형식이 일치하지 않습니다.");
          // Validate the immutable final snapshot too: callers may use the existing signed upload.
          var bytes = new ByteArrayOutputStream();
          storage.objects.download(o, r.get("final_key").toString(), verified.sizeBytes(), bytes);
          LogImageValidation.verify(bytes.toByteArray(), r.get("mime").toString());
          db.update(
              "update log_images set state='READY' where owner_id=? and profile_id=? and id=?",
              o,
              p,
              id);
          return Map.of("id", id, "ready", true);
        });
  }

  public record ImageBytes(byte[] bytes, String mime) {}

  FilePolicy.Claim imageClaim(Map<String, Object> r) {
    return new FilePolicy.Claim(
        r.get("display_name").toString(),
        ((Number) r.get("size_bytes")).longValue(),
        r.get("sha256").toString(),
        r.get("mime").toString());
  }

  public ImageBytes download(UUID p, UUID id) {
    UUID o = owner();
    var r = image(o, p, id);
    if (!"READY".equals(r.get("state"))) throw error(404, "사진을 찾을 수 없습니다.");
    var output = new ByteArrayOutputStream();
    storage.objects.download(
        o, r.get("final_key").toString(), ((Number) r.get("size_bytes")).longValue(), output);
    return new ImageBytes(output.toByteArray(), r.get("mime").toString());
  }
}
