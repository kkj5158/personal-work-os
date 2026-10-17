-- Additive: canonical sessions, events, receipts and reminder settings are untouched.
create table sleep_goals (
 owner_id uuid primary key references auth.users(id),
 revision bigint not null check (revision > 0),
 document jsonb not null,
 updated_at timestamptz not null default now()
);
