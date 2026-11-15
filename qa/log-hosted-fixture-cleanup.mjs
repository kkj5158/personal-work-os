// Explicit disposable DEV identity fence; removes only this run's LOG fixtures and acknowledged exact keys.
import { execFileSync } from "node:child_process";
const [runId, ...owners] = process.argv.slice(2),
  uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
try {
  if (
    !uuid.test(runId) ||
    owners.length < 1 ||
    owners.length > 2 ||
    owners.some((x) => !uuid.test(x)) ||
    process.env.RAILWAY_ENVIRONMENT_ID !==
      "9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c" ||
    process.env.RAILWAY_SERVICE_ID !== "eba7d263-7dc3-448a-a6b8-c2994721b597" ||
    process.env.SPRING_PROFILES_ACTIVE !== "hosted-dev" ||
    process.env.SHARED_DESK_STORAGE_ENVIRONMENT !== "DEV"
  )
    throw Error("DEV_FENCE");
  const url = new URL(process.env.DEV_DB_URL.replace(/^jdbc:/, ""));
  if (!url.hostname.endsWith(".railway.internal"))
    throw Error("DEV_DATABASE_FENCE");
  const d = JSON.parse(
    execFileSync(
      "pwsh.exe",
      [
        "-NoProfile",
        "-Command",
        "railway variable list --project 2b52b232-38b2-44b6-b97e-4caba54f90bc --environment 9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c --service 0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9 --json",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  const proxy = new URL(d.DATABASE_PUBLIC_URL);
  url.hostname = proxy.hostname;
  url.port = proxy.port;
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port,
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: process.env.DEV_DB_USERNAME,
    PGPASSWORD: process.env.DEV_DB_PASSWORD,
    PGCONNECT_TIMEOUT: "15",
    PGOPTIONS: "-c statement_timeout=20000 -c lock_timeout=10000",
  };
  const query = (sql) =>
    execFileSync(
      "C:/Program Files/PostgreSQL/18/bin/psql.exe",
      ["-X", "-w", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
      {
        env,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
  const ownerSql = owners.map((o) => `'${o}'::uuid`).join(",");
  const guards = owners
    .map(
      (o, i) =>
        `IF EXISTS(SELECT 1 FROM auth.users WHERE id='${o}'::uuid AND NOT(email='log-qa-${runId}-${i === 0 ? "a" : "b"}@example.invalid' AND raw_user_meta_data->>'qaRunId'='${runId}')) THEN RAISE EXCEPTION 'SYNTHETIC_IDENTITY_FENCE'; END IF; IF EXISTS(SELECT 1 FROM log_profiles WHERE owner_id='${o}'::uuid AND handle NOT LIKE 'logqa_${runId.slice(0, 8)}%') THEN RAISE EXCEPTION 'SYNTHETIC_PROFILE_FENCE'; END IF;`,
    )
    .join(" ");
  query(`BEGIN READ ONLY;DO $$ BEGIN ${guards} END $$;COMMIT;`);
  const rows = JSON.parse(
    query(
      `SELECT coalesce(json_agg(json_build_object('owner',owner_id,'staging',staging_key,'final',final_key)),'[]') FROM log_images WHERE owner_id IN (${ownerSql})`,
    ),
  );
  for (const owner of owners) {
    const keys = rows
      .filter((r) => r.owner === owner)
      .map(({ staging, final }) => ({ staging, final }));
    for (const pair of keys)
      for (const key of Object.values(pair))
        if (
          !new RegExp(`^log/dev/${owner}/(staging|final)/[a-f0-9-]{36}$`).test(
            key,
          )
        )
          throw Error("SYNTHETIC_OBJECT_FENCE");
    if (keys.length) {
      const childEnv = {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) =>
              /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME)$/i.test(
                key,
              ) || key.startsWith("SHARED_DESK_STORAGE_"),
          ),
        ),
        LOG_CLEANUP_OWNER: owner,
        LOG_CLEANUP_KEYS: JSON.stringify(keys),
      };
      execFileSync(
        "cmd.exe",
        [
          "/d",
          "/c",
          "gradlew.bat",
          "test",
          "--tests",
          "com.kafka.backend.log.LogProviderCleanupTest",
          "--no-daemon",
          "--max-workers=2",
          "--console=plain",
        ],
        {
          cwd: "backend",
          env: childEnv,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 240000,
        },
      );
    }
  }
  const sql = `BEGIN;DO $$ BEGIN ${guards} END $$;SELECT owner_id FROM log_workspaces WHERE owner_id IN (${ownerSql}) FOR UPDATE;UPDATE log_workspaces SET active_profile_id=null WHERE owner_id IN (${ownerSql});UPDATE log_profiles SET avatar_id=null WHERE owner_id IN (${ownerSql});DELETE FROM log_posts WHERE owner_id IN (${ownerSql});DELETE FROM log_drafts WHERE owner_id IN (${ownerSql});DELETE FROM log_images WHERE owner_id IN (${ownerSql});DELETE FROM log_profiles WHERE owner_id IN (${ownerSql});DELETE FROM log_workspaces WHERE owner_id IN (${ownerSql});DELETE FROM auth.users WHERE id IN (${ownerSql}) AND raw_user_meta_data->>'qaRunId'='${runId}';COMMIT;SELECT count(*) FROM log_workspaces WHERE owner_id IN (${ownerSql});`;
  if (!query(sql).endsWith("0")) throw Error("SYNTHETIC_DATA_REMAINS");
  console.log("SYNTHETIC_LOG_CLEANUP_PASS");
} catch {
  console.log("SYNTHETIC_LOG_CLEANUP_FAIL");
  process.exitCode = 1;
}
