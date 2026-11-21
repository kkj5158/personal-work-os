-- RSS excerpts are a private discovery queue, never archival full text.
CREATE TABLE naver_archive_rss_config (
 owner_id uuid PRIMARY KEY, blog_id varchar(60) NOT NULL DEFAULT 'yozo990' CHECK(blog_id='yozo990'),
 enabled boolean NOT NULL DEFAULT false, version bigint NOT NULL DEFAULT 1,
 baseline_at timestamptz, last_attempt_at timestamptz, last_success_at timestamptz,
 next_retry_at timestamptz, failures integer NOT NULL DEFAULT 0,
 policy_blocked boolean NOT NULL DEFAULT false, last_error_category varchar(60),
 coverage_gap boolean NOT NULL DEFAULT false
);
CREATE TABLE naver_archive_rss_items (
 owner_id uuid NOT NULL REFERENCES naver_archive_rss_config(owner_id),
 provider varchar(20) NOT NULL DEFAULT 'NAVER_RSS' CHECK(provider='NAVER_RSS'),
 blog_id varchar(60) NOT NULL CHECK(blog_id='yozo990'), external_post_id varchar(80) NOT NULL CHECK(external_post_id ~ '^[0-9]{1,30}$'),
 title varchar(500) NOT NULL, category varchar(200), published_at timestamptz, original_url varchar(1000) NOT NULL,
 excerpt text NOT NULL, source_sha256 char(64) NOT NULL,
 state varchar(32) NOT NULL CHECK(state IN ('PARTIAL_NEEDS_SOURCE','EXISTING_ARCHIVE','POSSIBLE_DUPLICATE_REVIEW','BASELINE_ONLY','SOURCE_EDIT_REVIEW')),
 media_incomplete boolean NOT NULL DEFAULT true, truncated boolean NOT NULL,
 first_seen_at timestamptz NOT NULL, last_seen_at timestamptz NOT NULL,
 linked_post_id uuid, duplicate_ids text NOT NULL DEFAULT '[]',
 PRIMARY KEY(owner_id,provider,blog_id,external_post_id),
 FOREIGN KEY(owner_id,linked_post_id) REFERENCES naver_archive_posts(owner_id,id)
);
CREATE INDEX naver_rss_pending ON naver_archive_rss_items(owner_id,state,first_seen_at DESC,external_post_id DESC);
CREATE TABLE naver_archive_rss_runs (
 owner_id uuid NOT NULL REFERENCES naver_archive_rss_config(owner_id), request_id uuid NOT NULL,
 id uuid NOT NULL, trigger_kind varchar(16) NOT NULL CHECK(trigger_kind IN ('MANUAL','SCHEDULED')),
 started_at timestamptz NOT NULL, finished_at timestamptz NOT NULL,
 state varchar(32) NOT NULL, feed_sha256 char(64), error_category varchar(60), result text NOT NULL,
 PRIMARY KEY(owner_id,request_id), UNIQUE(owner_id,id)
);
ALTER TABLE naver_archive_rss_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_archive_rss_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE naver_archive_rss_runs ENABLE ROW LEVEL SECURITY;
