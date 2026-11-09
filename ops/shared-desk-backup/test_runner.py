"""Synthetic tests; no Railway credentials or live business data."""
import base64
import contextlib
import copy
import datetime as dt
import io
import os
import tempfile
import time
from pathlib import Path
import unittest
from unittest.mock import patch
import uuid

import psycopg
from psycopg import sql
import runner as r


class FakeClient:
    def __init__(self, store):
        self.store, self.parts = store, {}

    def create_multipart_upload(self, **kw):
        token = uuid.uuid4().hex
        self.parts[token] = []
        return {"UploadId": token}

    def upload_part(self, **kw):
        self.parts[kw["UploadId"]].append(kw["Body"])
        return {"ETag": "synthetic"}

    def complete_multipart_upload(self, **kw):
        self.store.values[kw["Key"]] = b"".join(self.parts.pop(kw["UploadId"]))

    def abort_multipart_upload(self, **kw):
        self.parts.pop(kw["UploadId"], None)


class MemoryStore:
    def __init__(self, name):
        self.identity = ("https://synthetic.invalid", name)
        self.bucket, self.values, self.deleted = name, {}, []
        self.client = FakeClient(self)
        self.corrupt_upload = False

    def put_json(self, key, value):
        self.values[key] = r.canonical(value)

    def json(self, key):
        import json
        return json.loads(self.values[key])

    @contextlib.contextmanager
    def reader(self, key):
        yield io.BytesIO(self.values[key])

    def upload(self, key, path):
        self.values[key] = path.read_bytes()
        if self.corrupt_upload:
            self.values[key] = self.values[key][:-1]

    def keys(self, prefix):
        yield from sorted(k for k in self.values if k.startswith(prefix))

    def delete(self, key):
        self.deleted.append(key)
        self.values.pop(key, None)


def environment():
    return {"BACKUP_ENVIRONMENT": "dev", "BACKUP_ENCRYPTION_KEY_B64": base64.b64encode(b"s" * 32).decode(),
            "BACKUP_KEY_ID": "synthetic-v1", "BACKUP_DATABASE_URL": "postgresql://desk_backup_test@127.0.0.1:55491/postgres",
            "PG_DUMP": "C:/Program Files/PostgreSQL/18/bin/pg_dump.exe",
            "PG_RESTORE": "C:/Program Files/PostgreSQL/18/bin/pg_restore.exe"}


class CipherTests(unittest.TestCase):
    def setUp(self):
        self.cipher = r.Cipher(b"s" * 32, "synthetic-v1")
        self.plain = (b"synthetic-private-body\n" * 100000)
        output = io.BytesIO()
        self.proof = self.cipher.encrypt(io.BytesIO(self.plain), output, "run/artifact", 4 * r.CHUNK)
        self.encrypted = output.getvalue()

    def decode(self, value=None, context="run/artifact", cipher=None):
        sink = io.BytesIO()
        proof = (cipher or self.cipher).decrypt(io.BytesIO(value or self.encrypted), sink, context, 4 * r.CHUNK)
        return proof, sink.getvalue()

    def test_round_trip_multiple_frames_and_empty(self):
        proof, plain = self.decode()
        self.assertEqual(proof, self.proof)
        self.assertEqual(plain, self.plain)
        self.assertNotIn(b"synthetic-private-body", self.encrypted)
        out = io.BytesIO()
        self.cipher.encrypt(io.BytesIO(b""), out, "empty", 1)
        self.assertEqual(self.cipher.decrypt(io.BytesIO(out.getvalue()), r.NullSink(), "empty", 1)["plainBytes"], 0)

    def test_fresh_salt_changes_ciphertext(self):
        output = io.BytesIO()
        self.cipher.encrypt(io.BytesIO(self.plain), output, "run/artifact", 4 * r.CHUNK)
        self.assertNotEqual(self.encrypted, output.getvalue())

    def test_wrong_context_cannot_swap_artifacts(self):
        with self.assertRaisesRegex(r.Failure, "CIPHER_AUTH"):
            self.decode(context="different-run/artifact")

    def test_wrong_key_rejected(self):
        with self.assertRaisesRegex(r.Failure, "CIPHER_AUTH"):
            self.decode(cipher=r.Cipher(b"t" * 32, "synthetic-v1"))

    def test_bit_flip_rejected(self):
        tampered = bytearray(self.encrypted)
        tampered[100] ^= 1
        with self.assertRaisesRegex(r.Failure, "CIPHER_AUTH"):
            self.decode(bytes(tampered))

    def test_missing_authenticated_end_rejected(self):
        with self.assertRaisesRegex(r.Failure, "TRUNCATED"):
            self.decode(self.encrypted[:-20])

    def test_partial_frame_rejected(self):
        with self.assertRaises(r.Failure):
            self.decode(self.encrypted[:-1])

    def test_trailing_bytes_rejected(self):
        with self.assertRaisesRegex(r.Failure, "TRAILING"):
            self.decode(self.encrypted + b"x")

    def test_oversized_frame_rejected_without_allocation(self):
        import struct
        with self.assertRaisesRegex(r.Failure, "CIPHER_FRAME"):
            self.decode(self.encrypted[:40] + struct.pack(">I", 2**32 - 1))

    def test_stream_size_limit(self):
        with self.assertRaisesRegex(r.Failure, "ARTIFACT_LIMIT"):
            self.cipher.encrypt(io.BytesIO(self.plain), io.BytesIO(), "x", 10)
        with self.assertRaisesRegex(r.Failure, "ARTIFACT_LIMIT"):
            self.cipher.decrypt(io.BytesIO(self.encrypted), r.NullSink(), "run/artifact", 10)

    def test_signed_marker_tamper_rejected(self):
        envelope = self.cipher.sign({"keyId": "synthetic-v1", "objects": 3})
        envelope["payload"]["objects"] = 4
        with self.assertRaisesRegex(r.Failure, "MARKER_AUTH"):
            self.cipher.authenticate(envelope)


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.data, self.archive = MemoryStore("data"), MemoryStore("archive")
        self.backup = r.Backup(environment(), self.data, self.archive)
        self.run = "20261109T000000Z_" + "1" * 32

    def test_separate_bucket_required(self):
        with self.assertRaisesRegex(r.Failure, "BUCKET_SEPARATION"):
            r.Backup(environment(), self.data, self.data)

    def test_wrong_owner_path_and_traversal_rejected(self):
        owner = uuid.uuid4()
        for key in (f"shared-desk/dev/{uuid.uuid4()}/final/{uuid.uuid4()}",
                    f"shared-desk/dev/{owner}/final/../../secret", f"shared-desk/prod/{owner}/final/{uuid.uuid4()}"):
            with self.assertRaises(r.Failure):
                r.object_claim((uuid.uuid4(), owner, key, 1, "0" * 64), "dev")

    def test_digest_mismatch_does_not_upload(self):
        with self.assertRaisesRegex(r.Failure, "SOURCE_DIGEST"):
            self.backup.artifact(self.run, "object-000000.enc", io.BytesIO(b"data"), 10,
                                 {"plainBytes": 4, "plainSha256": "0" * 64})
        self.assertFalse(self.archive.values)

    def test_actual_remote_corruption_detected(self):
        self.archive.corrupt_upload = True
        with self.assertRaises(r.Failure):
            self.backup.artifact(self.run, "object-000000.enc", io.BytesIO(b"data"), 10)
        self.assertFalse(any(k.endswith("complete.json") for k in self.archive.values))

    def seed_marker(self, day, order):
        run = day + f"T{order:06d}Z_" + uuid.uuid4().hex
        artifacts = []
        for name in ("metadata.enc", "manifest.enc"):
            key = self.backup.root + run + "/" + name
            self.archive.values[key] = b"ciphertext"
            artifacts.append({"name": name, "cipherBytes": 10, "cipherSha256": "0" * 64,
                              "plainBytes": 1, "plainSha256": "0" * 64})
        marker = self.backup.envelope({"runId": run, "createdAt": "2026-11-09T00:00:00+00:00", "objects": 0,
                                       "objectBytes": 0, "artifacts": artifacts, "manifestSha256": "0" * 64})
        self.archive.put_json(self.backup.root + run + "/complete.json", marker)
        self.archive.put_json(self.backup.root + run + "/started.json", {})
        return run

    def test_retention_seven_daily_latest_sets_and_no_unrelated_delete(self):
        runs = [self.seed_marker(f"202611{day:02d}", 10000) for day in range(1, 10)]
        latest = self.seed_marker("20261109", 20000)
        unrelated = "other-product/private.bin"
        malformed = self.backup.root + "../../other/complete.json"
        incomplete = self.backup.root + "20261001T000000Z_" + "3" * 32 + "/metadata.enc"
        self.archive.values.update({unrelated: b"x", malformed: b"x", incomplete: b"x"})
        self.assertEqual(self.backup.retain(), 3)
        kept = [x["runId"] for x in self.backup.markers()]
        self.assertEqual(len(kept), 7)
        self.assertIn(latest, kept)
        self.assertNotIn(runs[-1], kept)
        self.assertTrue(all(x in self.archive.values for x in (unrelated, malformed, incomplete)))
        self.assertTrue(all(k.startswith(self.backup.root) and ".." not in k for k in self.archive.deleted))

    def test_authenticated_marker_cannot_expand_deletion_scope(self):
        run = self.seed_marker("20261101", 10000)
        key = self.backup.root + run + "/complete.json"
        envelope = self.archive.json(key)
        envelope["payload"]["artifacts"][0]["name"] = "../../secret"
        self.archive.put_json(key, self.backup.envelope(envelope["payload"]))
        with self.assertRaisesRegex(r.Failure, "MARKER_ARTIFACTS"):
            self.backup.retain()
        self.assertFalse(self.archive.deleted)

    def test_restore_requires_explicit_isolation(self):
        with self.assertRaisesRegex(r.Failure, "RESTORE_ACK"):
            r.restore(self.backup, self.run)

    def test_only_old_authenticated_incomplete_inventory_is_removed(self):
        prefix = self.backup.root + self.run + "/"
        names = ["metadata.enc", "manifest.enc", "object-000000.enc"]
        inventory = self.backup.envelope({"runId": self.run, "createdAt": "2026-10-01T00:00:00+00:00", "artifacts": names})
        self.archive.put_json(prefix + "started.json", inventory)
        for name in names:
            self.archive.values[prefix + name] = b"ciphertext"
        self.archive.values[prefix + "unrelated.bin"] = b"preserved"
        self.backup.prune_incomplete()
        self.assertEqual(self.archive.values, {prefix + "unrelated.bin": b"preserved"})

    def test_incomplete_forged_inventory_is_preserved(self):
        prefix = self.backup.root + self.run + "/"
        inventory = self.backup.envelope({"runId": self.run, "createdAt": "2026-10-01T00:00:00+00:00", "artifacts": ["metadata.enc", "manifest.enc"]})
        inventory["payload"]["artifacts"].append("../../secret")
        self.archive.put_json(prefix + "started.json", inventory)
        with self.assertRaisesRegex(r.Failure, "MARKER_AUTH"):
            self.backup.prune_incomplete()
        self.assertFalse(self.archive.deleted)

    def test_hung_dump_process_is_killed_without_completion_marker(self):
        import sys
        with tempfile.TemporaryDirectory() as directory:
            script = Path(directory) / "hung.py"
            script.write_text("import time\ntime.sleep(60)\n")
            # Use a launcher seam to test the exact owned subprocess timer on Windows.
            original = r.subprocess.Popen
            def launch(command, **kwargs):
                return original([sys.executable, str(script)], **kwargs)
            started = time.monotonic()
            with patch.object(r.subprocess, "Popen", side_effect=launch):
                with self.assertRaisesRegex(r.Failure, "PG_DUMP"):
                    with r.dump_stream("postgresql://fixture@127.0.0.1/fixture", "synthetic", timeout=0.2) as stream:
                        self.assertEqual(stream.read(r.CHUNK), b"")
            self.assertLess(time.monotonic() - started, 5)
            self.assertFalse(any(k.endswith("complete.json") for k in self.archive.values))


@unittest.skipUnless(os.environ.get("BACKUP_TEST_DATABASE_URL") == "postgresql://desk_backup_test@127.0.0.1:55491/postgres",
                     "requires explicitly owned loopback fixture PostgreSQL")
class PostgresTests(unittest.TestCase):
    def setUp(self):
        self.admin = os.environ["BACKUP_TEST_DATABASE_URL"]
        self.name = "shared_desk_test_" + uuid.uuid4().hex[:16]
        self.restore_name = "shared_desk_restore_" + uuid.uuid4().hex[:16]
        with psycopg.connect(self.admin, autocommit=True) as db:
            db.execute(sql.SQL("create database {}").format(sql.Identifier(self.name)))
            db.execute(sql.SQL("create database {}").format(sql.Identifier(self.restore_name)))
        self.url = self.admin.rsplit("/", 1)[0] + "/" + self.name
        self.restore_url = self.admin.rsplit("/", 1)[0] + "/" + self.restore_name
        self.env = dict(environment(), BACKUP_DATABASE_URL=self.url)
        self.owner, self.item, self.memo = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        self.key = f"shared-desk/dev/{self.owner}/final/{uuid.uuid4()}"
        self.data, self.archive, self.target = MemoryStore("data"), MemoryStore("archive"), MemoryStore("restore")
        self.data.values[self.key] = b"synthetic archive bytes\n"
        with psycopg.connect(self.url) as db:
            db.execute("create schema auth; create table auth.users(id uuid primary key); "
                       "create table public.projects(id uuid primary key,user_id uuid not null)")
            migration = Path(__file__).resolve().parents[2] / "backend/src/main/resources/db/migration/V101__shared_desk_v1.sql"
            db.execute(migration.read_text(encoding="utf-8"))
            db.execute("insert into auth.users values(%s)", (self.owner,))
            db.execute("insert into shared_desk_sync_heads(owner_id) values(%s)", (self.owner,))
            db.execute("insert into shared_desk_items(id,owner_id,kind,title,deleted_at) values(%s,%s,'FILE','synthetic',now())", (self.item, self.owner))
            db.execute("insert into shared_desk_items(id,owner_id,kind,title,body) values(%s,%s,'MEMO','synthetic','synthetic memo')", (self.memo, self.owner))
            db.execute("insert into shared_desk_files(item_id,owner_id,display_name,size_bytes,sha256,claimed_mime,state,staging_key,final_key,ticket_id,upload_expires_at) "
                       "values(%s,%s,'synthetic.txt',%s,%s,'text/plain','READY',%s,%s,%s,now())",
                       (self.item, self.owner, len(self.data.values[self.key]), r.sha(self.data.values[self.key]), "staging-" + uuid.uuid4().hex, self.key, uuid.uuid4()))
            db.execute("insert into shared_desk_memo_files(owner_id,memo_id,file_id) values(%s,%s,%s)", (self.owner, self.memo, self.item))
            db.execute("insert into shared_desk_replies(id,owner_id,parent_id,body) values(%s,%s,%s,'synthetic reply')", (uuid.uuid4(), self.owner, self.memo))

    def tearDown(self):
        with psycopg.connect(self.admin, autocommit=True) as db:
            for name in (self.name, self.restore_name):
                db.execute(sql.SQL("drop database {} with (force)").format(sql.Identifier(name)))

    def test_full_snapshot_encrypted_backup_and_verified_isolated_restore(self):
        backup = r.Backup(self.env, self.data, self.archive)
        result = backup.run()
        self.assertEqual(result["state"], "SUCCESS")
        self.assertEqual(result["objects"], 1)  # Includes file already in trash.
        marker, manifest = backup.manifest(result["runId"])
        self.assertEqual(manifest["sharedDeskTables"]["shared_desk_memo_files"]["rows"], 1)
        self.assertEqual(manifest["sharedDeskTables"]["shared_desk_replies"]["rows"], 1)
        for key, value in self.archive.values.items():
            if key.endswith(".enc"):
                self.assertNotIn(b"synthetic memo", value)
        backup.env.update(RESTORE_DATABASE_URL=self.restore_url, RESTORE_ISOLATION_ACK="isolated-empty-database-and-bucket")
        with patch.object(r, "Store", return_value=self.target):
            restored = r.restore(backup, result["runId"])
        self.assertEqual(restored["state"], "RESTORED_VERIFIED")
        self.assertEqual(restored["sharedDeskTables"], 11)
        self.assertTrue(restored["ownerReferencesVerified"])
        self.assertEqual(self.target.values[self.key], self.data.values[self.key])
        self.assertEqual(len(self.data.values), 1)  # Source never mutated.
        self.assertFalse(self.data.deleted)

    def test_exported_snapshot_excludes_later_metadata_and_shared_cleanup_lock(self):
        with psycopg.connect(self.url, autocommit=True) as guard, psycopg.connect(self.url, autocommit=True) as api:
            self.assertTrue(guard.execute("select pg_try_advisory_lock(%s,%s)", r.LOCK).fetchone()[0])
            self.assertFalse(api.execute("select pg_try_advisory_lock_shared(%s,%s)", r.LOCK).fetchone()[0])
            guard.execute("begin isolation level repeatable read read only")
            snapshot = guard.execute("select pg_export_snapshot()").fetchone()[0]
            api.execute("update shared_desk_items set body='later body' where id=%s", (self.memo,))
            with psycopg.connect(self.url, autocommit=True) as imported:
                imported.execute("begin isolation level repeatable read read only")
                imported.execute(sql.SQL("set transaction snapshot {}").format(sql.Literal(snapshot)))
                self.assertEqual(imported.execute("select body from shared_desk_items where id=%s", (self.memo,)).fetchone()[0], "synthetic memo")
                imported.execute("rollback")
            guard.execute("rollback")
            guard.execute("select pg_advisory_unlock(%s,%s)", r.LOCK)
            self.assertTrue(api.execute("select pg_try_advisory_lock_shared(%s,%s)", r.LOCK).fetchone()[0])
            self.assertFalse(guard.execute("select pg_try_advisory_lock(%s,%s)", r.LOCK).fetchone()[0])
            api.execute("select pg_advisory_unlock_shared(%s,%s)", r.LOCK)

    def test_missing_object_does_not_commit_success(self):
        self.data.values.clear()
        with self.assertRaises(KeyError):
            r.Backup(self.env, self.data, self.archive).run()
        self.assertFalse(any(k.endswith("complete.json") for k in self.archive.values))

    def test_early_restore_child_failure_is_safe_and_does_not_write_object_bytes(self):
        import sys
        backup = r.Backup(self.env, self.data, self.archive)
        result = backup.run()
        backup.env.update(RESTORE_DATABASE_URL=self.restore_url, RESTORE_ISOLATION_ACK="isolated-empty-database-and-bucket")
        original = r.subprocess.Popen
        def failed_restore(command, **kwargs):
            return original([sys.executable, "-c", "import sys;sys.exit(1)"], **kwargs)
        with patch.object(r, "Store", return_value=self.target), patch.object(r.subprocess, "Popen", side_effect=failed_restore):
            with self.assertRaisesRegex(r.Failure, "PG_RESTORE"):
                r.restore(backup, result["runId"])
        self.assertFalse(self.target.values)
        self.assertFalse(self.data.deleted)


if __name__ == "__main__":
    unittest.main()
