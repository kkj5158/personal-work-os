-- POS owns sleep facts; cache/projections do not introduce a second ledger.
create table sleep_settings (
 owner_id uuid primary key references auth.users(id), revision bigint not null default 1,
 document jsonb not null, updated_at timestamptz not null default now()
);
create table sleep_cycles (
 owner_id uuid not null references auth.users(id), cycle_id text not null,
 expected_wake_date date not null, timezone text not null, settings_revision bigint not null,
 document jsonb not null, primary key(owner_id,cycle_id)
);
create table sleep_sessions (
 id uuid primary key, owner_id uuid not null references auth.users(id), cycle_id text not null,
 status text not null check(status in ('OPEN','CLOSED','INCOMPLETE')),
 bedtime_at timestamptz, wake_at timestamptz, logical_wake_date date,
 expected_wake_date date not null, excluded_at timestamptz,
 revision bigint not null check(revision>0), document jsonb not null,
 updated_at timestamptz not null default now(),
 constraint sleep_valid_interval check(wake_at is null or bedtime_at is null or
   (wake_at>bedtime_at and wake_at<=bedtime_at+interval '24 hours')),
 constraint sleep_closed_endpoints check(status<>'CLOSED' or (bedtime_at is not null and wake_at is not null)),
 constraint sleep_open_endpoints check(status<>'OPEN' or (bedtime_at is not null and wake_at is null)),
 constraint sleep_incomplete_endpoints check(status<>'INCOMPLETE' or bedtime_at is null or wake_at is null),
 foreign key(owner_id,cycle_id) references sleep_cycles(owner_id,cycle_id)
);
create unique index sleep_one_active on sleep_sessions(owner_id) where status='OPEN' and excluded_at is null;
create unique index sleep_one_wake_day on sleep_sessions(owner_id,logical_wake_date) where excluded_at is null and logical_wake_date is not null;
create index sleep_owner_history on sleep_sessions(owner_id,expected_wake_date desc,id desc);
create table sleep_events (
 event_id uuid primary key, owner_id uuid not null references auth.users(id), session_id uuid not null references sleep_sessions(id),
 operation_id uuid not null, previous_revision bigint not null, new_revision bigint not null,
 document jsonb not null, committed_at timestamptz not null default now(),
 unique(owner_id,operation_id,session_id), unique(session_id,new_revision)
);
create table sleep_receipts (
 owner_id uuid not null references auth.users(id), operation_id uuid not null,
 request jsonb not null, receipt jsonb not null, committed_at timestamptz not null default now(),
 primary key(owner_id,operation_id)
);
create table sleep_pending (
 owner_id uuid not null references auth.users(id), occurrence_id text not null, cycle_id text not null,
 document jsonb not null, primary key(owner_id,occurrence_id),
 foreign key(owner_id,cycle_id) references sleep_cycles(owner_id,cycle_id)
);
create table sleep_context_revisions (
 owner_id uuid primary key references auth.users(id), revision bigint not null default 0,
 changed_dates jsonb not null default '[]', updated_at timestamptz not null default now()
);
