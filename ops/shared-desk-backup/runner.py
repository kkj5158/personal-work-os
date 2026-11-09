"""Private, authenticated, chunk-encrypted PostgreSQL + Shared Desk object backup.

No credentials, row bodies, filenames, object keys, SQL/provider exceptions, or
subprocess stderr are logged. Only ciphertext is written to temporary disk.
"""
from __future__ import annotations

import argparse
import base64
import contextlib
import datetime as dt
import hashlib
import hmac
import io
import json
import os
import re
import signal
import struct
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

import boto3
import psycopg
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from psycopg import sql

CHUNK = 1024 * 1024
MAGIC = b"SDBAK001"
LOCK = (1396982321, 1)  # DeskMaintenance shared / backup exclusive; database-local.
RUN_RE = re.compile(r"^\d{8}T\d{6}Z_[0-9a-f]{32}$")
TABLE_RE = re.compile(r"^shared_desk_[a-z_]+$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_OBJECTS = 100000
MAX_MANIFEST = 32 * CHUNK
TRANSFER = TransferConfig(multipart_threshold=8 * CHUNK, multipart_chunksize=8 * CHUNK,
                          max_concurrency=1, use_threads=False)


class Failure(Exception):
    """An allowlisted, nonsecret error category."""


def require(ok, code):
    if not ok:
        raise Failure(code)


def utcnow():
    return dt.datetime.now(dt.timezone.utc)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_exact(stream, size):
    out = bytearray()
    while len(out) < size:
        part = stream.read(size - len(out))
        require(bool(part), "CIPHERTEXT_TRUNCATED")
        out.extend(part)
    return bytes(out)


class Cipher:
    def __init__(self, key, key_id):
        require(len(key) == 32 and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", key_id), "KEY_CONFIG")
        self.key_id = key_id
        self.enc = HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
                        info=b"shared-desk-backup-encryption-v1").derive(key)
        self.mac = HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
                        info=b"shared-desk-backup-marker-v1").derive(key)

    def sign(self, payload):
        return {"payload": payload, "hmacSha256": hmac.new(self.mac, canonical(payload), "sha256").hexdigest()}

    def authenticate(self, envelope):
        payload = envelope["payload"]
        expected = hmac.new(self.mac, canonical(payload), "sha256").hexdigest()
        require(hmac.compare_digest(expected, envelope.get("hmacSha256", "")), "MARKER_AUTH")
        require(payload.get("keyId") == self.key_id, "KEY_ID")
        return payload

    def encrypt(self, source, dest, context, limit, check=None):
        # New 256-bit salt derives an independent AES key for every artifact.
        # Header and run/artifact identity are authenticated for every frame.
        header = MAGIC + os.urandom(32)
        dest.write(header)
        aad = header + context.encode()
        digest, total, counter = hashlib.sha256(), 0, 0
        cipher = AESGCM(HKDF(algorithm=hashes.SHA256(), length=32, salt=header[8:], info=b"artifact-v1").derive(self.enc))
        while True:
            if check:
                check()
            part = source.read(CHUNK)
            require(part is not None and len(part) <= CHUNK, "STREAM_PROTOCOL")
            total += len(part)
            require(total <= limit and counter < 2**32, "ARTIFACT_LIMIT")
            digest.update(part)
            encrypted = cipher.encrypt(b"\x00" * 8 + struct.pack(">I", counter), part, aad + struct.pack(">I", counter))
            dest.write(struct.pack(">I", len(encrypted)))
            dest.write(encrypted)
            counter += 1
            if not part:  # mandatory authenticated end frame detects truncation
                return {"plainBytes": total, "plainSha256": digest.hexdigest()}

    def decrypt(self, source, sink, context, limit, check=None):
        header = read_exact(source, 40)
        require(header[:8] == MAGIC, "CIPHER_VERSION")
        digest, total, counter = hashlib.sha256(), 0, 0
        cipher = AESGCM(HKDF(algorithm=hashes.SHA256(), length=32, salt=header[8:], info=b"artifact-v1").derive(self.enc))
        while True:
            if check:
                check()
            length = struct.unpack(">I", read_exact(source, 4))[0]
            require(16 <= length <= CHUNK + 16 and counter < 2**32, "CIPHER_FRAME")
            try:
                plain = cipher.decrypt(b"\x00" * 8 + struct.pack(">I", counter), read_exact(source, length),
                                       header + context.encode() + struct.pack(">I", counter))
            except Exception:
                raise Failure("CIPHER_AUTH") from None
            total += len(plain)
            require(total <= limit, "ARTIFACT_LIMIT")
            digest.update(plain)
            if plain:
                sink.write(plain)
            else:
                require(not source.read(1), "CIPHER_TRAILING")
                return {"plainBytes": total, "plainSha256": digest.hexdigest()}
            counter += 1


class NullSink:
    def write(self, value):
        return len(value)


class HashReader:
    def __init__(self, raw):
        self.raw, self.digest, self.size = raw, hashlib.sha256(), 0

    def read(self, n):
        data = self.raw.read(n)
        self.digest.update(data)
        self.size += len(data)
        return data


class Store:
    def __init__(self, prefix, env=os.environ):
        endpoint = env[prefix + "_S3_ENDPOINT"]
        require(urlparse(endpoint).scheme == "https" and not urlparse(endpoint).username,
                "S3_ENDPOINT")
        self.bucket = env[prefix + "_S3_BUCKET"]
        self.identity = (endpoint, self.bucket)
        self.client = boto3.client("s3", endpoint_url=endpoint,
            region_name=env.get(prefix + "_S3_REGION", "auto"),
            aws_access_key_id=env[prefix + "_S3_ACCESS_KEY_ID"],
            aws_secret_access_key=env[prefix + "_S3_SECRET_ACCESS_KEY"],
            config=Config(connect_timeout=15, read_timeout=120, retries={"max_attempts": 3, "mode": "standard"},
                          s3={"addressing_style": "path" if env.get(prefix + "_S3_PATH_STYLE", "false") == "true" else "virtual"}))

    def put_json(self, key, value):
        self.client.put_object(Bucket=self.bucket, Key=key, Body=canonical(value),
                               ContentType="application/json", CacheControl="private,no-store")

    @contextlib.contextmanager
    def reader(self, key):
        body = self.client.get_object(Bucket=self.bucket, Key=key)["Body"]
        try:
            yield body
        finally:
            body.close()

    def json(self, key, limit=MAX_MANIFEST):
        with self.reader(key) as body:
            raw = body.read(limit + 1)
            require(len(raw) <= limit, "JSON_LIMIT")
            return json.loads(raw)

    def upload(self, key, path):
        self.client.upload_file(str(path), self.bucket, key, Config=TRANSFER,
                                ExtraArgs={"ContentType": "application/octet-stream", "CacheControl": "private,no-store"})

    def keys(self, prefix):
        for page in self.client.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                yield obj["Key"]

    def delete(self, key):
        self.client.delete_object(Bucket=self.bucket, Key=key)
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
        except self.client.exceptions.ClientError as error:
            require(error.response["ResponseMetadata"]["HTTPStatusCode"] == 404, "DELETE_VERIFY")
            return
        raise Failure("DELETE_VERIFY")


def object_claim(row, environment):
    item, owner, key, size, digest = row
    owner = str(uuid.UUID(str(owner)))
    require(re.fullmatch(r"shared-desk/" + environment + "/" + owner + r"/final/[0-9a-f-]{36}", key or "") is not None,
            "SOURCE_KEY_SCOPE")
    uuid.UUID(key.rsplit("/", 1)[1])
    require(0 < size <= 100 * CHUNK and SHA_RE.fullmatch(digest or ""), "SOURCE_CLAIM")
    return {"itemId": str(item), "ownerId": owner, "sourceKey": key, "sizeBytes": size, "sha256": digest}


def table_digests(connection):
    tables = [r[0] for r in connection.execute("select tablename from pg_tables where schemaname='public' "
                                              "and tablename like 'shared_desk_%' order by tablename")]
    require(len(tables) >= 11 and all(TABLE_RE.fullmatch(t) for t in tables), "SHARED_DESK_SCHEMA")
    result = {}
    for table in tables:
        digest, count = hashlib.sha256(), 0
        # Server-side cursor bounds client memory; ordering makes reconciliation deterministic.
        with connection.cursor(name="digest_" + uuid.uuid4().hex) as cursor:
            # A 1-MiB text body can expand sixfold when JSON escapes controls.
            # Bound a fetch batch explicitly; the driver default is 100 rows.
            cursor.itersize = 8
            cursor.execute(sql.SQL("select to_jsonb(t)::text from public.{} t order by to_jsonb(t)::text collate \"C\"").format(sql.Identifier(table)))
            for (value,) in cursor:
                encoded = value.encode()
                digest.update(struct.pack(">Q", len(encoded)))
                digest.update(encoded)
                count += 1
        result[table] = {"rows": count, "sha256": digest.hexdigest()}
    return result


def database_environment(url):
    # libpq environment avoids credentials/URL in command arguments and process output.
    values = psycopg.conninfo.conninfo_to_dict(url)
    env = os.environ.copy()
    for key, name in {"host": "PGHOST", "port": "PGPORT", "dbname": "PGDATABASE", "user": "PGUSER",
                      "password": "PGPASSWORD", "sslmode": "PGSSLMODE", "sslrootcert": "PGSSLROOTCERT"}.items():
        if key in values:
            env[name] = values[key]
    env["PGCONNECT_TIMEOUT"] = "20"
    env["PGOPTIONS"] = "-c timezone=UTC -c datestyle=ISO,YMD -c intervalstyle=postgres"
    return env


@contextlib.contextmanager
def dump_stream(url, snapshot, executable="pg_dump", timeout=10800):
    process = subprocess.Popen([executable, "--format=custom", "--compress=6",
                                "--no-owner", "--no-acl", "--lock-wait-timeout=30s", "--snapshot=" + snapshot],
                               env=database_environment(url), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    timer = threading.Timer(timeout, lambda: process.kill() if process.poll() is None else None)
    timer.daemon = True
    timer.start()
    try:
        yield process.stdout
        require(process.wait(timeout=60) == 0, "PG_DUMP")
    finally:
        timer.cancel()
        process.stdout.close()
        if process.poll() is None:
            process.kill()
            process.wait()


class Backup:
    def __init__(self, env=os.environ, data=None, archive=None):
        self.env = env
        self.environment = env["BACKUP_ENVIRONMENT"]
        require(self.environment in ("dev", "prod"), "ENVIRONMENT")
        self.cipher = Cipher(base64.b64decode(env["BACKUP_ENCRYPTION_KEY_B64"], validate=True), env["BACKUP_KEY_ID"])
        self.data, self.archive = data or Store("DATA", env), archive or Store("BACKUP", env)
        require(self.data.identity != self.archive.identity, "BUCKET_SEPARATION")
        self.root = "shared-desk-backup/v1/" + self.environment + "/"
        self.limit = int(env.get("BACKUP_MAX_DUMP_BYTES", str(16 * 1024**3)))
        self.max_seconds = int(env.get("BACKUP_MAX_SECONDS", "10800"))
        require(CHUNK <= self.limit <= 128 * 1024**3 and 60 <= self.max_seconds <= 14400, "LIMIT_CONFIG")
        self.started = time.monotonic()

    def deadline(self):
        require(time.monotonic() - self.started < self.max_seconds, "TIME_BUDGET")

    def envelope(self, payload):
        return self.cipher.sign(dict(payload, keyId=self.cipher.key_id, environment=self.environment, version=1))

    def status(self, state, **fields):
        # This is intentionally nonsecret and independently HMAC authenticated.
        self.archive.put_json(self.root + "status.json", self.envelope({"state": state, "at": utcnow().isoformat(), **fields}))

    def artifact(self, run, name, stream, limit, expected=None):
        self.deadline()
        key = self.root + run + "/" + name
        with tempfile.TemporaryDirectory(prefix="shared-desk-encrypted-") as directory:
            path = Path(directory) / "artifact.enc"
            with path.open("wb") as output:
                proof = self.cipher.encrypt(stream, output, key, limit, self.deadline)
            if expected:
                require(proof == expected, "SOURCE_DIGEST")
            digest, size = hashlib.sha256(), 0
            with path.open("rb") as value:
                while part := value.read(CHUNK):
                    digest.update(part)
                    size += len(part)
            entry = {"name": name, "cipherBytes": size, "cipherSha256": digest.hexdigest(), **proof}
            self.archive.upload(key, path)
            # Read actual remote bytes, authenticate each frame, and verify both hashes before commit.
            self.verify_artifact(run, entry)
            return entry

    def verify_artifact(self, run, entry, sink=None):
        self.deadline()
        key = self.root + run + "/" + entry["name"]
        with self.archive.reader(key) as body:
            hashed = HashReader(body)
            proof = self.cipher.decrypt(hashed, sink or NullSink(), key, self.limit, self.deadline)
        require(hashed.size == entry["cipherBytes"] and hashed.digest.hexdigest() == entry["cipherSha256"], "REMOTE_CIPHER_DIGEST")
        require(proof == {k: entry[k] for k in ("plainBytes", "plainSha256")}, "REMOTE_PLAIN_DIGEST")

    def run(self):
        run = utcnow().strftime("%Y%m%dT%H%M%SZ_") + uuid.uuid4().hex
        self.status("RUNNING", runId=run)
        url = self.env["BACKUP_DATABASE_URL"]
        # Dedicated session; lock must span snapshot acquisition, dump and all object copies.
        with psycopg.connect(url, autocommit=True, connect_timeout=20) as guard:
            acquired = guard.execute("select pg_try_advisory_lock(%s,%s)", LOCK).fetchone()[0]
            require(acquired, "BACKUP_ALREADY_RUNNING")
            try:
                guard.execute("set timezone='UTC'")
                guard.execute("set datestyle='ISO,YMD'")
                guard.execute("set intervalstyle='postgres'")
                guard.execute("begin isolation level repeatable read read only")
                snapshot = guard.execute("select pg_export_snapshot()").fetchone()[0]
                objects = [object_claim(row, self.environment) for row in guard.execute(
                    "select f.item_id,f.owner_id,f.final_key,f.size_bytes,f.sha256 from public.shared_desk_files f "
                    "join public.shared_desk_items i on i.id=f.item_id and i.owner_id=f.owner_id "
                    "where f.state='READY' order by f.item_id")]
                require(len(objects) <= MAX_OBJECTS, "OBJECT_COUNT_LIMIT")
                tables = table_digests(guard)
                # Snapshot may contain pending uploads; they are preserved as metadata, never advertised as restored READY.
                pending = guard.execute("select count(*) from public.shared_desk_files where state in ('UPLOADING','VERIFYING')").fetchone()[0]
                names = ["metadata.enc", "manifest.enc"] + [f"object-{i:06d}.enc" for i in range(len(objects))]
                self.archive.put_json(self.root + run + "/started.json", self.envelope({"runId": run, "createdAt": utcnow().isoformat(), "artifacts": names}))
                artifacts = []
                with dump_stream(url, snapshot, self.env.get("PG_DUMP", "pg_dump"), self.max_seconds) as stream:
                    artifacts.append(self.artifact(run, "metadata.enc", stream, self.limit))
                for i, obj in enumerate(objects):
                    obj["artifact"] = names[i + 2]
                    with self.data.reader(obj["sourceKey"]) as stream:
                        artifacts.append(self.artifact(run, obj["artifact"], stream, obj["sizeBytes"],
                            {"plainBytes": obj["sizeBytes"], "plainSha256": obj["sha256"]}))
                manifest = {"version": 1, "environment": self.environment, "runId": run,
                            "createdAt": utcnow().isoformat(), "sourceRevision": self.env.get("SOURCE_REVISION", "unknown"),
                            "objects": objects, "sharedDeskTables": tables, "pendingUploads": pending,
                            "metadata": artifacts[0], "artifacts": artifacts}
                raw = canonical(manifest)
                require(len(raw) <= MAX_MANIFEST, "MANIFEST_LIMIT")
                artifacts.append(self.artifact(run, "manifest.enc", io.BytesIO(raw), MAX_MANIFEST))
                # Prove the lock connection survived; READY bytes are already immutable and verified remotely.
                guard.execute("select 1").fetchone()
                marker = self.envelope({"runId": run, "createdAt": utcnow().isoformat(),
                    "objects": len(objects), "objectBytes": sum(x["sizeBytes"] for x in objects),
                    "artifacts": artifacts, "manifestSha256": sha(raw)})
                self.archive.put_json(self.root + run + "/complete.json", marker)
                require(self.cipher.authenticate(self.archive.json(self.root + run + "/complete.json")) == marker["payload"], "COMMIT_READBACK")
                guard.execute("rollback")
                removed = self.retain()
                self.status("SUCCESS", runId=run, objects=len(objects), objectBytes=sum(x["sizeBytes"] for x in objects),
                            encryptedArtifacts=len(artifacts), retentionDailyTarget=7, removedSets=removed,
                            durationSeconds=round(time.monotonic() - self.started))
            finally:
                guard.execute("rollback")
                guard.execute("select pg_advisory_unlock(%s,%s)", LOCK)
        return {"state": "SUCCESS", "runId": run, "objects": len(objects), "pendingUploads": pending,
                "durationSeconds": round(time.monotonic() - self.started)}

    def markers(self):
        # Bucket listing only within this job's private namespace; never list the data bucket.
        runs = set()
        for key in self.archive.keys(self.root):
            suffix = key[len(self.root):]
            if suffix.count("/") == 1 and suffix.endswith("/complete.json") and RUN_RE.fullmatch(suffix.split("/")[0]):
                runs.add(suffix.split("/")[0])
        result = []
        for run in sorted(runs):
            marker = self.cipher.authenticate(self.archive.json(self.root + run + "/complete.json"))
            self.validate_marker(run, marker)
            result.append(marker)
        return result

    def validate_marker(self, run, marker):
        require(RUN_RE.fullmatch(run) and marker["runId"] == run and marker["environment"] == self.environment, "MARKER_SCOPE")
        names = [x["name"] for x in marker["artifacts"]]
        require(len(names) <= MAX_OBJECTS + 2 and len(names) == len(set(names)), "MARKER_ARTIFACTS")
        require(set(names) == {"metadata.enc", "manifest.enc"} | {f"object-{i:06d}.enc" for i in range(marker["objects"])}, "MARKER_ARTIFACTS")
        for entry in marker["artifacts"]:
            require(SHA_RE.fullmatch(entry["cipherSha256"]) and SHA_RE.fullmatch(entry["plainSha256"])
                    and 0 <= entry["plainBytes"] <= self.limit and entry["cipherBytes"] > 0, "MARKER_ARTIFACTS")

    def retain(self):
        markers = self.markers()
        # Seven most recent UTC dates, one latest successful set each. Failed backups never evict good sets.
        keep = set()
        days = set()
        for marker in reversed(markers):
            day = marker["runId"][:8]
            if day not in days and len(days) < 7:
                days.add(day)
                keep.add(marker["runId"])
        removed = 0
        for marker in markers:
            run = marker["runId"]
            if run in keep:
                continue
            # Remove commit first: a partially deleted set must never be offered for restore.
            self.archive.delete(self.root + run + "/complete.json")
            for entry in marker["artifacts"]:
                self.deadline()
                self.archive.delete(self.root + run + "/" + entry["name"])
            self.archive.delete(self.root + run + "/started.json")
            removed += 1
        self.prune_incomplete()
        return removed

    def prune_incomplete(self):
        # Crash leftovers have a signed inventory written before the first ciphertext.
        # Never delete objects inferred merely from a listed prefix or filename.
        keys = set(self.archive.keys(self.root))
        for key in sorted(keys):
            suffix = key[len(self.root):]
            if suffix.count("/") != 1 or not suffix.endswith("/started.json"):
                continue
            run = suffix.split("/")[0]
            if not RUN_RE.fullmatch(run) or self.root + run + "/complete.json" in keys:
                continue
            inventory = self.cipher.authenticate(self.archive.json(key))
            require(inventory["runId"] == run and inventory["environment"] == self.environment, "ORPHAN_SCOPE")
            age = (utcnow() - dt.datetime.fromisoformat(inventory["createdAt"])).total_seconds()
            if age < 48 * 3600:
                continue
            names = inventory["artifacts"]
            require(2 <= len(names) <= MAX_OBJECTS + 2 and len(names) == len(set(names)) and
                    set(names) == {"metadata.enc", "manifest.enc"} | {f"object-{i:06d}.enc" for i in range(len(names) - 2)},
                    "ORPHAN_INVENTORY")
            for name in names:
                self.deadline()
                self.archive.delete(self.root + run + "/" + name)
            self.archive.delete(key)

    def manifest(self, run):
        require(RUN_RE.fullmatch(run), "RUN_ID")
        marker = self.cipher.authenticate(self.archive.json(self.root + run + "/complete.json"))
        self.validate_marker(run, marker)
        entry = next(x for x in marker["artifacts"] if x["name"] == "manifest.enc")
        require(entry["plainBytes"] <= MAX_MANIFEST, "MANIFEST_LIMIT")
        output = io.BytesIO()
        self.verify_artifact(run, entry, output)
        raw = output.getvalue()
        require(sha(raw) == marker["manifestSha256"], "MANIFEST_DIGEST")
        manifest = json.loads(raw)
        require(manifest["runId"] == run and manifest["environment"] == self.environment, "MANIFEST_SCOPE")
        require(manifest["artifacts"] == [x for x in marker["artifacts"] if x["name"] != "manifest.enc"], "MANIFEST_ARTIFACTS")
        require(len(manifest["objects"]) == marker["objects"], "MANIFEST_OBJECTS")
        return marker, manifest


class MultipartSink:
    """At most 8 MiB of plaintext in memory; no plaintext files on disk."""
    def __init__(self, store, key):
        self.store, self.key = store, key
        self.upload = store.client.create_multipart_upload(Bucket=store.bucket, Key=key,
                            ContentType="application/octet-stream", CacheControl="private,no-store")["UploadId"]
        self.buffer, self.parts = bytearray(), []

    def write(self, value):
        self.buffer.extend(value)
        if len(self.buffer) >= 8 * CHUNK:
            self.flush()

    def flush(self):
        if not self.buffer:
            return
        number = len(self.parts) + 1
        response = self.store.client.upload_part(Bucket=self.store.bucket, Key=self.key, UploadId=self.upload,
                                                 PartNumber=number, Body=bytes(self.buffer))
        self.parts.append({"PartNumber": number, "ETag": response["ETag"]})
        self.buffer.clear()

    def finish(self):
        self.flush()
        self.store.client.complete_multipart_upload(Bucket=self.store.bucket, Key=self.key, UploadId=self.upload,
                                                    MultipartUpload={"Parts": self.parts})

    def abort(self):
        self.store.client.abort_multipart_upload(Bucket=self.store.bucket, Key=self.key, UploadId=self.upload)


def database_identity(url):
    values = psycopg.conninfo.conninfo_to_dict(url)
    return tuple(values.get(k, "") for k in ("host", "port", "dbname"))


def restore(backup, run):
    env = backup.env
    require(env.get("RESTORE_ISOLATION_ACK") == "isolated-empty-database-and-bucket", "RESTORE_ACK")
    target_url = env["RESTORE_DATABASE_URL"]
    dbname = psycopg.conninfo.conninfo_to_dict(target_url).get("dbname", "")
    require(re.fullmatch(r"shared_desk_restore_[0-9a-f]{12,32}", dbname), "RESTORE_DATABASE_SCOPE")
    require(database_identity(target_url) != database_identity(env["BACKUP_DATABASE_URL"]), "RESTORE_SOURCE_DATABASE")
    target = Store("RESTORE", env)
    require(target.identity not in (backup.data.identity, backup.archive.identity), "RESTORE_BUCKET_SCOPE")
    require(next(target.keys(""), None) is None, "RESTORE_BUCKET_NOT_EMPTY")
    marker, manifest = backup.manifest(run)
    # Authentication/digest pass of the entire set occurs before any target writes.
    for entry in marker["artifacts"]:
        backup.verify_artifact(run, entry)
    with psycopg.connect(target_url, connect_timeout=20) as db:
        require(db.execute("select current_database()").fetchone()[0] == dbname, "RESTORE_DATABASE_SCOPE")
        require(db.execute("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace "
                           "where n.nspname not like 'pg_%' and n.nspname<>'information_schema' "
                           "and c.relkind in ('r','p','v','m','S','f')").fetchone()[0] == 0, "RESTORE_DATABASE_NOT_EMPTY")
    process = subprocess.Popen([env.get("PG_RESTORE", "pg_restore"), "--dbname=" + dbname, "--no-owner", "--no-acl",
                                "--exit-on-error", "--single-transaction"], env=database_environment(target_url),
                               stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        try:
            backup.verify_artifact(run, manifest["metadata"], process.stdin)
            process.stdin.close()
        except BrokenPipeError:
            with contextlib.suppress(BrokenPipeError):
                process.stdin.close()
            process.wait(timeout=60)
            raise Failure("PG_RESTORE") from None
        require(process.wait(timeout=backup.max_seconds) == 0, "PG_RESTORE")
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
    with psycopg.connect(target_url, connect_timeout=20) as db:
        db.execute("set timezone='UTC'")
        db.execute("set datestyle='ISO,YMD'")
        db.execute("set intervalstyle='postgres'")
        require(table_digests(db) == manifest["sharedDeskTables"], "RESTORE_TABLE_DIGEST")
        require(db.execute("select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace "
                           "join pg_class t on t.oid=c.conrelid where n.nspname='public' "
                           "and t.relname like 'shared_desk_%' and c.contype='f' and not c.convalidated").fetchone()[0] == 0,
                "RESTORE_FOREIGN_KEYS")
        rows = db.execute("select f.item_id,f.owner_id,f.final_key,f.size_bytes,f.sha256 from public.shared_desk_files f "
                          "join public.shared_desk_items i on i.id=f.item_id and i.owner_id=f.owner_id "
                          "where f.state='READY' order by f.item_id").fetchall()
        expected = [{k: x[k] for k in ("itemId", "ownerId", "sourceKey", "sizeBytes", "sha256")} for x in manifest["objects"]]
        require([object_claim(row, backup.environment) for row in rows] == expected, "RESTORE_OWNER_REFERENCES")
    entries = {x["name"]: x for x in marker["artifacts"]}
    restored_bytes = 0
    for obj in manifest["objects"]:
        backup.deadline()
        key = obj["sourceKey"]
        sink = MultipartSink(target, key)
        try:
            backup.verify_artifact(run, entries[obj["artifact"]], sink)
            sink.finish()
        except Exception:
            sink.abort()
            raise
        digest, size = hashlib.sha256(), 0
        with target.reader(key) as body:
            while part := body.read(CHUNK):
                digest.update(part)
                size += len(part)
                require(size <= obj["sizeBytes"], "RESTORE_OBJECT_SIZE")
        require(size == obj["sizeBytes"] and digest.hexdigest() == obj["sha256"], "RESTORE_OBJECT_DIGEST")
        restored_bytes += size
    # No automatic cutover, source mutation, database drop, or deletion of restored bytes.
    return {"state": "RESTORED_VERIFIED", "runId": run, "sharedDeskTables": len(manifest["sharedDeskTables"]),
            "objects": len(manifest["objects"]), "objectBytes": restored_bytes, "ownerReferencesVerified": True,
            "foreignKeysValidated": True, "pendingUploadsRequireReissue": manifest["pendingUploads"],
            "durationSeconds": round(time.monotonic() - backup.started)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("backup", "verify", "restore", "status"))
    parser.add_argument("--run-id")
    args = parser.parse_args()
    def terminated(signum, frame):
        raise Failure("RUN_TIMEOUT")
    signal.signal(signal.SIGTERM, terminated)
    backup = None
    try:
        backup = Backup()
        if args.command == "backup":
            result = backup.run()
        elif args.command == "status":
            markers = backup.markers()
            require(bool(markers), "NO_COMPLETED_BACKUP")
            latest = markers[-1]
            age = (utcnow() - dt.datetime.fromisoformat(latest["createdAt"])).total_seconds()
            state = backup.cipher.authenticate(backup.archive.json(backup.root + "status.json"))
            require(age <= 26 * 3600 and state["state"] == "SUCCESS", "BACKUP_STALE_OR_FAILED")
            result = {"state": "HEALTHY", "latestCompletedAt": latest["createdAt"], "ageSeconds": round(age),
                      "completedDailySets": len(markers)}
        elif args.command == "verify":
            marker, manifest = backup.manifest(args.run_id)
            for entry in marker["artifacts"]:
                backup.verify_artifact(args.run_id, entry)
            result = {"state": "VERIFIED", "objects": len(manifest["objects"])}
        else:
            result = restore(backup, args.run_id)
        print(json.dumps(result, sort_keys=True))
    except Exception as error:
        code = str(error) if isinstance(error, Failure) else "UNEXPECTED_FAILURE"
        if backup is not None and args.command == "backup":
            try:
                backup.status("FAILED", code=code)
            except Exception:
                pass
        print(json.dumps({"state": "FAILED", "code": code}), flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
