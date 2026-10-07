-- POS owns exercise facts; Android mirrors are caches/outboxes only.
create table exercise_documents (
 owner_id uuid not null, id uuid not null, kind varchar(24) not null,
 revision bigint not null check (revision > 0), document jsonb not null,
 deleted_at timestamptz, updated_at timestamptz not null default now(),
 primary key(owner_id,id), check (kind in ('SESSION','ROUTINE','EXERCISE','SETTINGS'))
);
create index exercise_owner_kind on exercise_documents(owner_id,kind,updated_at);
create table exercise_mutations (
 owner_id uuid not null, mutation_id uuid not null, payload_hash varchar(64) not null,
 response jsonb not null, received_at timestamptz not null default now(),
 primary key(owner_id,mutation_id)
);
create table exercise_audit (
 owner_id uuid not null, event_id uuid not null, mutation_id uuid not null,
 document_id uuid not null, revision bigint not null, before_document jsonb,
 after_document jsonb not null, occurred_at timestamptz not null default now(),
 primary key(owner_id,event_id)
);
