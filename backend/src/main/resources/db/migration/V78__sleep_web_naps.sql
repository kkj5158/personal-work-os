-- Additive retrospective naps. Existing main facts, constraints and migrations stay intact.
create table sleep_naps (
 id uuid primary key, owner_id uuid not null references auth.users(id),
 start_at timestamptz not null, end_at timestamptz not null,
 start_local_date date not null, revision bigint not null check(revision>0),
 document jsonb not null, updated_at timestamptz not null default now(),
 constraint sleep_nap_positive_interval check(end_at>start_at)
);
create index sleep_naps_owner_date on sleep_naps(owner_id,start_local_date desc,id desc);
create table sleep_nap_events (
 event_id uuid primary key, owner_id uuid not null references auth.users(id),
 nap_id uuid not null references sleep_naps(id) on delete cascade,
 operation_id uuid not null, previous_revision bigint not null, new_revision bigint not null,
 document jsonb not null, committed_at timestamptz not null default now(),
 unique(owner_id,operation_id,nap_id), unique(nap_id,new_revision)
);
create table sleep_nap_tombstones (
 owner_id uuid not null references auth.users(id), nap_id uuid not null,
 revision bigint not null, operation_id uuid not null,
 deleted_at timestamptz not null default now(), primary key(owner_id,nap_id)
);
-- Facts are served only by authenticated POS owner-scoped services.
-- No browser/PostgREST policy or direct-write path is granted.
alter table sleep_naps enable row level security;
alter table sleep_nap_events enable row level security;
alter table sleep_nap_tombstones enable row level security;
