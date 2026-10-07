-- Forward-only SLEEP changes. Existing facts/history remain intact.
alter table sleep_sessions drop constraint sleep_valid_interval;
alter table sleep_sessions add constraint sleep_valid_interval
 check(wake_at is null or bedtime_at is null or wake_at>bedtime_at);
alter table sleep_events drop constraint sleep_events_session_id_fkey;
alter table sleep_events add constraint sleep_events_session_id_fkey
 foreign key(session_id) references sleep_sessions(id) on delete cascade;
create table sleep_tombstones (
 owner_id uuid not null references auth.users(id), session_id uuid not null,
 revision bigint not null, operation_id uuid not null, deleted_at timestamptz not null default now(),
 primary key(owner_id,session_id)
);
