-- Sleep-owned additive extensions. No existing facts/events/receipts are rewritten.
alter table sleep_tombstones add column expected_wake_date date;
alter table sleep_tombstones add column logical_wake_date date;
create index sleep_deleted_expected_day on sleep_tombstones(owner_id,expected_wake_date);
create index sleep_deleted_logical_day on sleep_tombstones(owner_id,logical_wake_date);

-- Subjective manual annotations live in the existing authoritative session document.
alter table sleep_sessions add constraint sleep_subjective_score check (
 document->'sleepScore' is null or document->'sleepScore' = 'null'::jsonb or
 (jsonb_typeof(document->'sleepScore')='number' and
  (document->>'sleepScore')::numeric between 0 and 100 and
  (document->>'sleepScore')::numeric=trunc((document->>'sleepScore')::numeric))
);
alter table sleep_sessions add constraint sleep_subjective_note check (
 document->'sleepNote' is null or document->'sleepNote' = 'null'::jsonb or
 (jsonb_typeof(document->'sleepNote')='string' and char_length(document->>'sleepNote')<=100 and
  position(chr(10) in (document->>'sleepNote'))=0 and position(chr(13) in (document->>'sleepNote'))=0)
);
