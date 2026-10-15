BEGIN;
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_anonymous)
VALUES('00000000-2026-4014-8000-000000000014','authenticated','authenticated','pos-migration-fixture@example.invalid','{"provider":"email"}'::jsonb,'{}'::jsonb,now(),now(),false)
ON CONFLICT(id) DO NOTHING;
SELECT json_build_object('kind','newVerifiedIdentityAnchor','pass',count(*)=1) FROM auth.users WHERE id='00000000-2026-4014-8000-000000000014';
ROLLBACK;
