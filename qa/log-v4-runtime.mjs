// Real local API/Web/PostgreSQL and the approved DEV private provider. No shared business DB writes.
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import readline from "node:readline";
import {
  available,
  ownedProcess,
  readiness,
  save,
  git,
} from "./runtime/core.mjs";

const root = await fs.realpath(process.cwd()),
  runId = "log-v4-runtime-" + randomUUID(),
  dir = path.join(root, ".qa", "runs", runId),
  data = path.join(dir, "postgres");
const ports = { pg: 55454, api: 18107, web: 13107 },
  pg = "C:/Program Files/PostgreSQL/18/bin",
  owner = randomUUID();
for (const port of Object.values(ports))
  if (!(await available(port))) throw Error("OWNED_PORT_OCCUPIED:" + port);
let variables;
try {
  variables = JSON.parse(
    execFileSync(
      "pwsh.exe",
      [
        "-NoProfile",
        "-Command",
        "railway variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --service eba7d263-7dc3-448a-a6b8-c2994721b597 --json",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
} catch {
  throw Error("DEV_STORAGE_VARIABLE_ACCESS_FAILED: raw output withheld");
}
if (
  variables.SHARED_DESK_STORAGE_ENVIRONMENT !== "DEV" ||
  variables.RAILWAY_ENVIRONMENT_ID !== "9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c"
)
  throw Error("DEV_STORAGE_IDENTITY_MISMATCH");
await fs.mkdir(data, { recursive: true });
if ((await fs.realpath(data)) !== data) throw Error("OWNED_PATH_REDIRECT");
const env = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|GRADLE_USER_HOME|JAVA_HOME)$/i.test(
        k,
      ),
    ),
  ),
  DEV_DB_URL: `jdbc:postgresql://127.0.0.1:${ports.pg}/postgres`,
  DEV_DB_USERNAME: "log_runtime",
  DEV_DB_PASSWORD: "",
  APP_DEV_USER_ID: owner,
  LOG_STORAGE_ENABLED: "true",
  STUDY_STORAGE_ENABLED: "false",
  STUDY_ENGINE_ENABLED: "false",
  NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${ports.api}`,
  NEXT_PUBLIC_APP_ENV: "dev",
  NEXT_PUBLIC_SUPABASE_URL: "",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
  SHARED_DESK_ENABLED: "false",
};
for (const [k, v] of Object.entries(variables))
  if (k.startsWith("SHARED_DESK_STORAGE_")) env[k] = v;
const secrets = Object.values(variables).filter(
    (v) => typeof v === "string" && v.length > 12,
  ),
  tasks = [];
let postgres, api, web, failure;
const result = {
  runId,
  revision: git(root, "rev-parse", "HEAD"),
  dirty: !!git(root, "status", "--porcelain"),
  startedAt: new Date().toISOString(),
  database: "OWNED_LOOPBACK",
  sharedDatabase: "NEVER_CONNECTED",
  storage: "EXISTING_DEV_PROVIDER_SEPARATE_LOG_NAMESPACE",
  browser: "PENDING",
};
function start(name, exe, args, cwd = root) {
  const task = ownedProcess(exe, args, {
    cwd,
    env,
    name,
    logFile: path.join(dir, name + ".log"),
    secrets,
  });
  tasks.push(task);
  return task;
}
async function sql(text) {
  const file = path.join(dir, "query.sql");
  await fs.writeFile(file, text);
  return execFileSync(
    path.join(pg, "psql.exe"),
    [
      "-h",
      "127.0.0.1",
      "-p",
      String(ports.pg),
      "-U",
      "log_runtime",
      "-d",
      "postgres",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      file,
    ],
    { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}
try {
  await start("initdb", path.join(pg, "initdb.exe"), [
    "-D",
    data,
    "-U",
    "log_runtime",
    "--auth-local=trust",
    "--auth-host=trust",
    "--encoding=UTF8",
    "--no-locale",
    "--no-sync",
  ]).wait(120000);
  postgres = start("postgres", path.join(pg, "postgres.exe"), [
    "-D",
    data,
    "-h",
    "127.0.0.1",
    "-p",
    String(ports.pg),
    "-c",
    "max_connections=12",
    "-c",
    "io_method=sync",
  ]);
  for (
    let i = 0;
    i < 120 && !postgres.output.includes("ready to accept connections");
    i++
  ) {
    postgres.check();
    await new Promise((r) => setTimeout(r, 250));
  }
  await sql(
    `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid primary key); INSERT INTO auth.users VALUES('${owner}');`,
  );
  await start(
    "backend-build",
    "cmd.exe",
    [
      "/d",
      "/c",
      "gradlew.bat",
      "bootJar",
      "--no-daemon",
      "--max-workers=2",
      "--console=plain",
    ],
    path.join(root, "backend"),
  ).wait(600000);
  api = start("backend", path.join(env.JAVA_HOME, "bin/java.exe"), [
    "-jar",
    path.join(root, "backend/build/libs/backend-0.0.1-SNAPSHOT.jar"),
    "--spring.profiles.active=dev",
    "--server.address=127.0.0.1",
    `--server.port=${ports.api}`,
    "--spring.datasource.hikari.maximum-pool-size=2",
    "--spring.datasource.hikari.minimum-idle=0",
    "--app.money.processing-enabled=false",
    "--app.money.classification-enabled=false",
    "--app.absence-backfill-cron=-",
    `--app.dev-allowed-origins=http://127.0.0.1:${ports.web}`,
  ]);
  await readiness(`http://127.0.0.1:${ports.api}/api/log/state`, api, 180000);
  await start(
    "frontend-build",
    "node",
    [path.join(root, "frontend/node_modules/next/dist/bin/next"), "build"],
    path.join(root, "frontend"),
  ).wait(600000);
  web = start(
    "frontend",
    "node",
    [
      path.join(root, "frontend/node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(ports.web),
    ],
    path.join(root, "frontend"),
  );
  await readiness(`http://127.0.0.1:${ports.web}/blog`, web, 180000);
  result.status = "READY";
  await save(path.join(dir, "runtime.json"), {
    ...result,
    ports,
    owner,
    processes: tasks.map((t) => ({ name: t.name, pid: t.child.pid })),
  });
  await save(path.join(root, ".qa/log-v4-runtime-current.json"), {
    runId,
    dir,
    ports,
    owner,
  });
  console.log(
    "LOG_RUNTIME_READY " +
      JSON.stringify({
        url: `http://127.0.0.1:${ports.web}/blog`,
        evidence: path.join(dir, "runtime.json"),
      }),
  );
  let requestedStop = false;
  const terminal = readline.createInterface({ input: process.stdin });
  terminal.on("line", (line) => {
    if (line === "stop") requestedStop = true;
  });
  while (!requestedStop) {
    try {
      await fs.access(path.join(dir, "stop-requested"));
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  terminal.close();
} catch (error) {
  failure = error;
  result.status = "FAIL";
  result.error = error.message;
} finally {
  // Delete only keys of this run's synthetic owner, with a tested adapter and separate LOG namespace.
  if (api && !api.exited)
    try {
      const raw = await sql(
        `select coalesce(json_agg(json_build_object('staging',staging_key,'final',final_key)),'[]') from log_images where owner_id='${owner}'`,
      );
      env.LOG_CLEANUP_OWNER = owner;
      env.LOG_CLEANUP_KEYS = raw;
      const nonce = randomUUID(), acknowledgement = path.join(dir, "provider-cleanup-ack.json");
      env.LOG_CLEANUP_NONCE = nonce;
      env.LOG_CLEANUP_ACK_FILE = acknowledgement;
      await start(
        "provider-cleanup",
        "cmd.exe",
        [
          "/d",
          "/c",
          "gradlew.bat",
          "test",
            "--rerun",
          "--tests",
          "com.kafka.backend.log.LogProviderCleanupTest",
          "--no-daemon",
          "--max-workers=2",
          "--console=plain",
        ],
        path.join(root, "backend"),
      ).wait(180000);
      const ack = JSON.parse(await fs.readFile(acknowledgement, "utf8"));
      if (ack.status !== "PASS" || ack.owner !== owner || ack.nonce !== nonce
          || ack.absentCount !== JSON.parse(raw).length * 2
          || ack.inputSha256 !== createHash("sha256").update(raw).digest("hex"))
        throw Error("PROVIDER_CLEANUP_ACK_MISMATCH");
      result.providerCleanup = "PASS";
      result.providerAbsenceCount = ack.absentCount;
    } catch (e) {
      result.providerCleanup = "FAIL";
      result.providerCleanupError = e.message;
    }
  const errors = [];
  for (const task of tasks.toReversed())
    if (task !== postgres)
      try {
        await task.stop();
      } catch (e) {
        errors.push(e.message);
      }
  if (postgres && !postgres.exited)
    try {
      const lines = (
        await fs.readFile(path.join(data, "postmaster.pid"), "utf8")
      ).split(/\r?\n/);
      if (
        Number(lines[0]) !== postgres.child.pid ||
        path.resolve(lines[1]) !== data ||
        Number(lines[3]) !== ports.pg
      )
        throw Error("PG_OWNERSHIP_MISMATCH");
      await start("pg-stop", path.join(pg, "pg_ctl.exe"), [
        "-D",
        data,
        "-m",
        "fast",
        "-w",
        "-t",
        "30",
        "stop",
      ]).wait(45000);
    } catch (e) {
      errors.push(e.message);
    }
  for (const task of tasks.toReversed())
    try {
      await task.stop();
    } catch (e) {
      errors.push(e.message);
    }
  result.cleanup = {
    errors,
    portsReleased: await Promise.all(Object.values(ports).map(available)),
    ownedDataRetained: true,
  };
  result.finishedAt = new Date().toISOString();
  await save(path.join(dir, "result.json"), result);
}
console.log(
  JSON.stringify(
    { ...result, evidence: path.join(dir, "result.json") },
    null,
    2,
  ),
);
if (failure) throw failure;
