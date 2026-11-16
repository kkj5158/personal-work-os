// Fixed Railway identities; read-only history, constraints and hashed preservation evidence.
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
const scope = process.argv[2],
  phase = process.argv[3] ?? "before";
const evidenceDir = process.env.LOG_MULTI_IMAGE_EVIDENCE_DIR ?? "D:/DEV_SPACE/pos-log-multi-image-evidence-20261116";
if (!["DEV", "PROD"].includes(scope) || !["before", "after"].includes(phase))
  throw Error("Explicit DEV/PROD and before/after required");
const project = "2b52b232-38b2-44b6-b97e-4caba54f90bc",
  ids = {
    DEV: {
      env: "9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c",
      api: "eba7d263-7dc3-448a-a6b8-c2994721b597",
      db: "0b4bf0aa-551e-4a41-bfa6-47d1bc1599d9",
    },
    PROD: {
      env: "c2c20488-311f-4b9e-9ec9-d79508123176",
      api: "e46b58f4-e829-430f-a4c4-b27e24d46f19",
      db: "e0b42e61-9207-4225-83ee-c516edc75202",
    },
  }[scope];
const variables = (service) => {
  try {
    return JSON.parse(
      execFileSync(
        "pwsh.exe",
        [
          "-NoProfile",
          "-Command",
          `railway.cmd variable list --project ${project} --environment ${ids.env} --service ${service} --json`,
        ],
        {
          encoding: "utf8",
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 60000,
        },
      ),
    );
  } catch {
    throw Error("OFFICIAL_CLI_VARIABLE_READ_FAILED:raw_output_withheld");
  }
};
try {
  const v = variables(ids.api);
  if (
    v.RAILWAY_ENVIRONMENT_ID !== ids.env ||
    v.SHARED_DESK_STORAGE_ENVIRONMENT !== scope ||
    v.SPRING_PROFILES_ACTIVE !== (scope === "DEV" ? "hosted-dev" : "prod")
  )
    throw Error("ENVIRONMENT_IDENTITY_MISMATCH");
  const u = new URL(v[scope + "_DB_URL"].replace(/^jdbc:/, ""));
  if (u.hostname.endsWith(".internal")) {
    const d = variables(ids.db);
    if (d.DATABASE_PUBLIC_URL) {
      const p = new URL(d.DATABASE_PUBLIC_URL);
      u.hostname = p.hostname;
      u.port = p.port;
    } else {
      if (!d.RAILWAY_TCP_PROXY_DOMAIN || !d.RAILWAY_TCP_PROXY_PORT)
        throw Error("APPROVED_PUBLIC_PROXY_MISSING");
      u.hostname = d.RAILWAY_TCP_PROXY_DOMAIN;
      u.port = d.RAILWAY_TCP_PROXY_PORT;
    }
  }
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGDATABASE: u.pathname.slice(1),
    PGUSER: v[scope + "_DB_USERNAME"],
    PGPASSWORD: v[scope + "_DB_PASSWORD"],
    PGSSLMODE: u.searchParams.get("sslmode") ?? "prefer",
    PGCONNECT_TIMEOUT: "15",
    PGOPTIONS: "-c statement_timeout=20000 -c default_transaction_read_only=on",
    PGAPPNAME: "pos-log-multi-image-readonly-audit",
  };
  const logTables=["log_workspaces","log_profiles","log_posts","log_replies","log_images","log_drafts","log_post_images","log_draft_images"];
  // Hash full canonical row JSON in PostgreSQL; no journal text, filenames, owner IDs or storage keys leave the server.
  // staging_cleaned is maintenance bookkeeping, so it is excluded from image preservation fingerprints.
  const fingerprints=logTables.map(table=>`'${table}',(select json_build_object('count',count(*),'rowHashes',coalesce(json_agg(h order by h),'[]')) from (select md5((to_jsonb(t)${table==="log_images"?"-'staging_cleaned'":""})::text) h from ${table} t) hashes)`).join(",");
  const sql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object(
 'history',(select json_agg(row_to_json(h)) from (select version,description,checksum,success from flyway_schema_history order by installed_rank)h),
 'logTables',(select coalesce(json_agg(tablename),'[]') from pg_tables where schemaname='public' and tablename like 'log_%'),
 'logSecurity',(select json_agg(json_build_object('table',c.relname,'rls',c.relrowsecurity,'policies',(select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(array['${logTables.join("','")}'])),
 'attachmentConstraints',(select json_agg(json_build_object('table',c.relname,'name',x.conname,'definition',pg_get_constraintdef(x.oid))) from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('log_post_images','log_draft_images') and x.contype='c'),
 'preservation',json_build_object(${fingerprints}),
 'businessTableEstimates',(select json_object_agg(relname,n_live_tup) from pg_stat_user_tables where schemaname='public' and relname not like 'log_%'));
ROLLBACK;`;
  const raw = execFileSync(
    "C:/Program Files/PostgreSQL/18/bin/psql.exe",
    ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
    {
      env,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30000,
    },
  );
  const evidence = {
    ...JSON.parse(raw.trim()),
    observedAt: new Date().toISOString(),
    scope,
    phase,
    readOnly: true,
    authProfile: v.SPRING_PROFILES_ACTIVE,
    storageEnvironment: v.SHARED_DESK_STORAGE_ENVIRONMENT,
    storageEnabled: v.SHARED_DESK_STORAGE_ENABLED,
    logStorageEnabled: v.LOG_STORAGE_ENABLED ?? "inherits shared provider",
  };
  const dir = evidenceDir;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    `${dir}/${scope.toLowerCase()}-preservation-${phase}.json`,
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify({
      status: "READ_ONLY_AUDIT_SAVED",
      scope,
      phase,
      history: evidence.history.filter((x) => Number(x.version) >= 100),
      logTables: evidence.logTables,
      authProfile: evidence.authProfile,
      storageEnvironment: evidence.storageEnvironment,
      preservationCounts:Object.fromEntries(Object.entries(evidence.preservation).map(([table,value])=>[table,value.count])),
      attachmentConstraints:evidence.attachmentConstraints,
      logSecurity:evidence.logSecurity,
    }),
  );
} catch (e) {
  console.error(
    "LOG_RELEASE_AUDIT_FAILED:" +
      e.message?.split(":")[0] +
      ":sensitive_details_withheld",
  );
  process.exitCode = 1;
}
