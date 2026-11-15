package com.kafka.backend.log;

import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Bounded exact-key cleanup. Never lists a bucket or touches another feature's metadata/keys. */
@Component
class LogMaintenance {
  final LogService s;
  final AtomicLong failures = new AtomicLong();

  LogMaintenance(LogService s) {
    this.s = s;
  }

  @Scheduled(fixedDelayString = "${LOG_CLEANUP_DELAY_MS:3600000}")
  void cleanup() {
    if (!s.storage.objects.enabled()) return;
    for (var row :
        s.db.queryForList(
            "select owner_id,profile_id,id,staging_key from log_images where state='READY' and not"
                + " staging_cleaned and created_at<current_timestamp-interval '15 minutes' order by"
                + " created_at limit 20"))
      try {
        UUID o = (UUID) row.get("owner_id");
        s.storage.objects.delete(o, row.get("staging_key").toString());
        s.db.update(
            "update log_images set staging_cleaned=true where owner_id=? and profile_id=? and id=?",
            o,
            row.get("profile_id"),
            row.get("id"));
      } catch (RuntimeException failure) {
        failures.incrementAndGet();
      }
    var candidates =
        s.db.queryForList(
            "select m.owner_id,m.profile_id,m.id from log_images m join log_profiles p on"
                + " m.profile_id=p.id where m.created_at<current_timestamp-interval '24 hours' and"
                + " ((p.deleted_at is not null and p.deleted_at<current_timestamp-interval '30"
                + " days') or (p.deleted_at is null and not exists(select 1 from log_post_images x"
                + " where x.image_id=m.id) and not exists(select 1 from log_draft_images x where"
                + " x.image_id=m.id) and p.avatar_id is distinct from m.id)) order by m.created_at"
                + " limit 20");
    for (var candidate : candidates)
      try {
        UUID owner = (UUID) candidate.get("owner_id"),
            profile = (UUID) candidate.get("profile_id"),
            id = (UUID) candidate.get("id");
        s.locked(
            owner,
            () -> {
              var rows =
                  s.db.queryForList(
                      "select m.* from log_images m join log_profiles p on m.profile_id=p.id where"
                          + " m.owner_id=? and m.profile_id=? and m.id=? and"
                          + " m.created_at<current_timestamp-interval '24 hours' and ((p.deleted_at"
                          + " is not null and p.deleted_at<current_timestamp-interval '30 days') or"
                          + " (p.deleted_at is null and not exists(select 1 from log_post_images x"
                          + " where x.image_id=m.id) and not exists(select 1 from log_draft_images"
                          + " x where x.image_id=m.id) and p.avatar_id is distinct from m.id))",
                      owner,
                      profile,
                      id);
              if (rows.isEmpty()) return null;
              var row = rows.getFirst();
              s.storage.objects.delete(owner, row.get("staging_key").toString());
              s.storage.objects.delete(owner, row.get("final_key").toString());
              // Removed-profile associations are inaccessible; preserve text metadata until profile
              // purge below.
              s.db.update(
                  "delete from log_post_images where owner_id=? and profile_id=? and image_id=?",
                  owner,
                  profile,
                  id);
              s.db.update(
                  "delete from log_draft_images where owner_id=? and profile_id=? and image_id=?",
                  owner,
                  profile,
                  id);
              s.db.update(
                  "update log_profiles set avatar_id=null where owner_id=? and id=? and"
                      + " avatar_id=?",
                  owner,
                  profile,
                  id);
              s.db.update(
                  "delete from log_images where owner_id=? and profile_id=? and id=?",
                  owner,
                  profile,
                  id);
              return null;
            });
      } catch (RuntimeException failure) {
        failures.incrementAndGet();
      }
    // Retention expiry only affects profiles explicitly deleted by their owner.
    for (var r :
        s.db.queryForList(
            "select owner_id,id from log_profiles where deleted_at<current_timestamp-interval '30"
                + " days' limit 10"))
      try {
        UUID o = (UUID) r.get("owner_id"), p = (UUID) r.get("id");
        s.locked(
            o,
            () -> {
              if (s.db.queryForObject(
                      "select count(*) from log_images where owner_id=? and profile_id=?",
                      Integer.class,
                      o,
                      p)
                  > 0) return null;
              s.db.update("delete from log_posts where owner_id=? and profile_id=?", o, p);
              s.db.update("delete from log_drafts where owner_id=? and profile_id=?", o, p);
              s.db.update(
                  "delete from log_profiles where owner_id=? and id=? and"
                      + " deleted_at<current_timestamp-interval '30 days'",
                  o,
                  p);
              return null;
            });
      } catch (RuntimeException failure) {
        failures.incrementAndGet();
      }
  }
}
