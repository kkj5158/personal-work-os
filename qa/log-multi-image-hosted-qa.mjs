// Execute only via official Railway CLI run for the fixed pos-auth-dev service.
// Disposable identities use normal password JWTs. Owner browser sessions are never read or replaced.
import {
  createPrivateKey,
  sign,
  randomBytes,
  randomUUID,
  createHash,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const evidenceDir = process.env.LOG_MULTI_IMAGE_EVIDENCE_DIR ?? "D:/DEV_SPACE/pos-log-multi-image-evidence-20261116";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = "2b52b232-38b2-44b6-b97e-4caba54f90bc",
  environment = "9fbb34eb-b9f3-49c3-837f-8eb12bb1fa9c";
const auth = "https://pos-auth-dev-development.up.railway.app/auth/v1",
  api = "https://workflow-api-development-development.up.railway.app";
const runId = randomUUID(),
  prefix = "logqa_" + runId.slice(0, 8),
  actors = [],
  report = {
    runId,
    scope: "REAL_HOSTED_DEV_NORMAL_AUTH_SYNTHETIC",
    ownerBrowserSessionUsed: false,
    checks: [],
    startedAt: new Date().toISOString(),
  };
let jwk;
const systemEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([k]) =>
      /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME)$/i.test(
        k,
      ),
    ),
  );
function admin() {
  const now = Math.floor(Date.now() / 1000),
    enc = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const body =
    enc({ alg: "ES256", kid: jwk.kid, typ: "JWT" }) +
    "." +
    enc({
      iss: process.env.GOTRUE_JWT_ISSUER,
      aud: process.env.GOTRUE_JWT_AUD,
      role: "service_role",
      iat: now,
      exp: now + 120,
    });
  return (
    body +
    "." +
    sign("sha256", Buffer.from(body), {
      key: createPrivateKey({ key: jwk, format: "jwk" }),
      dsaEncoding: "ieee-p1363",
    }).toString("base64url")
  );
}
function check(value, name) {
  if (!value) throw Error(name);
  report.checks.push({ name, status: "PASS" });
}
async function authRequest(route, method, body) {
  return fetch(auth + route, {
    method,
    headers: {
      apikey: process.env.POS_AUTH_PUBLISHABLE_KEY,
      Authorization: "Bearer " + admin(),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
}
async function login(actor) {
  const r = await fetch(auth + "/token?grant_type=password", {
    method: "POST",
    headers: {
      apikey: process.env.POS_AUTH_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: actor.email, password: actor.password }),
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const session = await r.json();
  check(r.ok && session.user?.id === actor.id, "NORMAL_PASSWORD_JWT");
  return session.access_token;
}
async function request(actor, route, method = "GET", body, expected = 200) {
  const response = await fetch(api + "/api/log" + route, {
    method,
    headers: {
      ...(actor ? { Authorization: "Bearer " + actor.token } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  check(
    response.status === expected,
    `HTTP_${method}_${route.split("?")[0]}_${expected}`,
  );
  if (expected !== 200 || response.status === 204) return null;
  return response.json();
}
try {
  if (
    process.env.RAILWAY_ENVIRONMENT_ID !== environment ||
    process.env.RAILWAY_SERVICE_ID !== "d3351c87-4d62-44eb-b171-055462d0ca19" ||
    new URL(process.env.API_EXTERNAL_URL ?? "https://invalid.invalid")
      .origin !== new URL(auth).origin
  )
    throw Error("DEV_AUTH_IDENTITY_FENCE");
  const keys = [];
  function find(v) {
    if (v && typeof v === "object") {
      if (v.kty === "EC" && v.d) keys.push(v);
      else Object.values(v).forEach(find);
    }
  }
  find(JSON.parse(process.env.GOTRUE_JWT_KEYS ?? "null"));
  if (keys.length !== 1) throw Error("DEV_AUTH_KEY_FENCE");
  jwk = keys[0];
  for (const label of ["a", "b"]) {
    const actor = {
      label,
      email: `log-qa-${runId}-${label}@example.invalid`,
      password: randomBytes(32).toString("base64url"),
    };
    const response = await authRequest("/admin/users", "POST", {
      email: actor.email,
      password: actor.password,
      email_confirm: true,
      user_metadata: { qaRunId: runId, purpose: "POS LOG disposable QA" },
    });
    const user = await response.json();
    check(
      response.ok &&
        user.email === actor.email &&
        user.user_metadata?.qaRunId === runId,
      "CREATE_OWNED_SYNTHETIC_IDENTITY_" + label,
    );
    actor.id = user.id;
    actors.push(actor);
    actor.token = await login(actor);
  }
  const [a, b] = actors;
  let state = await request(a, "/state");
  check(state.maxImagesPerPost === 20 && state.maxImageBytes === 18 * 1024 * 1024, "DECLARED_ATTACHMENT_AND_BYTE_LIMITS");
  check(
    state.ownerId === a.id && state.profiles.length === 0,
    "EMPTY_ACCOUNT_NO_SEED",
  );
  const p = await request(a, "/profiles", "POST", {
      id: randomUUID(),
      name: "LOG QA primary",
      handle: prefix + "_a",
      bio: "Synthetic hosted verification",
    }),
    q = await request(a, "/profiles", "POST", {
      id: randomUUID(),
      name: "LOG QA secondary",
      handle: prefix + "_b",
      bio: "",
    });
  await request(
    a,
    "/profiles",
    "POST",
    { id: randomUUID(), name: "collision", handle: p.handle.toUpperCase() },
    409,
  );
  await request(a, `/profiles/${q.id}/active`, "PUT");
  state = await request(a, "/state");
  check(state.activeProfileId === q.id, "SERVER_PROFILE_PREFERENCE");
  let draft = await request(a, `/profiles/${p.id}/draft`);
  draft = await request(a, `/profiles/${p.id}/draft`, "PUT", {
    ...draft,
    text: "Hosted cross-device draft",
    images: [],
  });
  check(
    (await request(a, `/profiles/${q.id}/draft`)).text === "",
    "PROFILE_DRAFT_ISOLATION",
  );
  const images = [];
  for (let i = 1; i <= 21; i++) {
    // Existing synthetic mixed-aspect rasters; repeat bytes under distinct media UUIDs.
    const bytes = i===21 ? Buffer.from("UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAfQxYrUvP+BiOh/AAA=","base64") : await fs.readFile(
        `D:/DEV_SPACE/pos-log-v4-evidence-20261115/fixtures/photo-${(i - 1) % 4 + 1}.png`,
      ),
      id = randomUUID(),
      sha256 = createHash("sha256").update(bytes).digest("hex");
    const claim = {
      id,
      name: `photo-${i}.${i===21?"webp":"png"}`,
      sizeBytes: bytes.length,
      mime: i===21?"image/webp":"image/png",
      sha256,
    };
    await request(a, `/profiles/${p.id}/images`, "POST", claim);
    if (i === 1) {
      const retriedTicket = await request(a, `/profiles/${p.id}/images`, "POST", claim);
      check(retriedTicket.id === id, "RESERVATION_RETRY_SAME_ID");
      await request(a, `/profiles/${p.id}/images`, "POST", {...claim, name: "changed.png"}, 409);
    }
    const send = () => fetch(
      `${api}/api/log/profiles/${p.id}/images/${id}/bytes`,
      {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + a.token,
          "Content-Type": "application/octet-stream",
        },
        body: bytes,
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      },
    );
    const sent = await send();
    check(sent.status === 204, "PRIVATE_UPLOAD_" + i);
    if (i === 1) check((await send()).status === 204, "BYTE_PUT_RETRY_BEFORE_COMPLETE");
    await request(a, `/profiles/${p.id}/images/${id}/complete`, "POST", {});
    if (i === 1) {
      const completed = await request(a, `/profiles/${p.id}/images/${id}/complete`, "POST", {});
      check(completed.ready && completed.id === id, "COMPLETE_RESPONSE_LOSS_RETRY");
      check((await send()).status === 204, "BYTE_PUT_RETRY_AFTER_READY");
      const readyTicket = await request(a, `/profiles/${p.id}/images`, "POST", claim);
      check(readyTicket.ready && readyTicket.id === id, "RESERVATION_RETRY_AFTER_READY");
    }
    const got = await fetch(`${api}/api/log/profiles/${p.id}/images/${id}`, {
      headers: { Authorization: "Bearer " + a.token },
      redirect: "error",
    });
    check(
      got.ok &&
        createHash("sha256")
          .update(Buffer.from(await got.arrayBuffer()))
          .digest("hex") === sha256 &&
        got.headers.get("cache-control")?.includes("no-store") &&
        got.headers.get("x-content-type-options") === "nosniff",
      "PRIVATE_DOWNLOAD_INTEGRITY_HEADERS_" + i,
    );
    images.push(id);
  }
  // Declared type/size and actual content are independent server checks.
  const invalidClaim = {id: randomUUID(), name: "bad.png", sizeBytes: 8, mime: "image/png", sha256: "0".repeat(64)};
  await request(a, `/profiles/${p.id}/images`, "POST", {...invalidClaim, mime:"image/svg+xml", name:"bad.svg"}, 400);
  await request(a, `/profiles/${p.id}/images`, "POST", {...invalidClaim, mime:"image/jpeg"}, 400);
  await request(a, `/profiles/${p.id}/images`, "POST", {...invalidClaim, sizeBytes:18*1024*1024+1}, 413);
  for (const [label, bytes, expectedPut] of [
    ["FALSE_MAGIC", Buffer.from("not-a-real-image"), 422],
    ["TRUNCATED_PNG", Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), 204],
  ]) {
    const badId=randomUUID();
    await request(a, `/profiles/${p.id}/images`, "POST", {id:badId,name:"invalid.png",mime:"image/png",sizeBytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
    const sent=await fetch(`${api}/api/log/profiles/${p.id}/images/${badId}/bytes`,{method:"PUT",headers:{Authorization:"Bearer "+a.token,"Content-Type":"application/octet-stream"},body:bytes,signal:AbortSignal.timeout(30000)});
    check(sent.status===expectedPut,label+"_PUT_REJECTION_BOUNDARY");
    if(expectedPut===204)await request(a, `/profiles/${p.id}/images/${badId}/complete`, "POST", {},422);
    await request(a, `/profiles/${p.id}/images/${badId}`, "GET", undefined,404);
  }
  for (const count of [0,1,2,3,4,20]) {
    const batch = await request(a, `/profiles/${p.id}/posts`, "POST", {id:randomUUID(),text:count===1?"":"Hosted batch "+count,images:images.slice(0,count)});
    const persistedBatch=await request(a,`/profiles/${p.id}/posts/${batch.id}`);
    check(JSON.stringify(persistedBatch.images)===JSON.stringify(images.slice(0,count)),`BATCH_${count}_ORDER_PERSISTENCE`);
    if(count===1)check(persistedBatch.text==="","IMAGE_ONLY_POST");
    await request(a,`/profiles/${p.id}/posts/${batch.id}/delete`,"POST",{revision:batch.revision,confirm:true});
  }
  await request(a, `/profiles/${p.id}/posts`, "POST", {id:randomUUID(),text:"over cap",images},400);
  await request(a, `/profiles/${p.id}/draft`, "PUT", {...draft,images},400);
  await request(a, `/profiles/${p.id}/posts`, "POST", {id:randomUUID(),text:"duplicate",images:[images[0],images[0]]},400);
  await request(a, `/profiles/${q.id}/posts`, "POST", {id:randomUUID(),text:"wrong profile image",images:[images[0]]},404);
  const sharedPost=await request(a, `/profiles/${p.id}/posts`, "POST", {id:randomUUID(),text:"shared immutable image",images:[images[0]]});
  const disposablePost=await request(a, `/profiles/${p.id}/posts`, "POST", {id:randomUUID(),text:"delete only this reference",images:[images[0]]});
  await request(a,`/profiles/${p.id}/posts/${disposablePost.id}/delete`,"POST",{revision:disposablePost.revision,confirm:true});
  const stillReadable=await fetch(`${api}/api/log/profiles/${p.id}/images/${images[0]}`,{headers:{Authorization:"Bearer "+a.token}});
  check(stillReadable.ok&&(await request(a,`/profiles/${p.id}/posts/${sharedPost.id}`)).images[0]===images[0],"SHARED_IMAGE_SURVIVES_OTHER_POST_DELETE");
  await request(a,`/profiles/${p.id}/posts/${sharedPost.id}/delete`,"POST",{revision:sharedPost.revision,confirm:true});
  images.pop(); // Keep 20 READY images for the remainder of the legacy regression.
  draft=await request(a, `/profiles/${p.id}/draft`, "PUT", {...draft,images});
  check((await request(a, `/profiles/${p.id}/draft`)).images.length===20,"DRAFT_TWENTY_RELOAD");
  const id = randomUUID();
  let post = await request(a, `/profiles/${p.id}/posts`, "POST", {
    id,
    text: "Hosted LOG record\nSecond line",
    images,
    draftRevision: draft.revision,
  });
  const replay = await request(a, `/profiles/${p.id}/posts`, "POST", {
    id,
    text: "must not overwrite",
    images: [],
  });
  check(replay.text === post.text, "CREATE_REPLAY_NO_OVERWRITE");
  check(
    (await request(a, `/profiles/${p.id}/draft`)).text === "",
    "ATOMIC_POST_DRAFT_CONSUMPTION",
  );
  post = await request(a, `/profiles/${p.id}/posts/${id}`, "PUT", {
    revision: post.revision,
    text: "Hosted inline edit\nImages retained",
    images,
  });
  const reordered=[...images].reverse().slice(0,19);
  post=await request(a,`/profiles/${p.id}/posts/${id}`,"PUT",{revision:post.revision,text:post.text,images:reordered});
  check(JSON.stringify((await request(a,`/profiles/${p.id}/posts/${id}`)).images)===JSON.stringify(reordered),"EDIT_REORDER_REMOVE_RELOAD");
  post=await request(a,`/profiles/${p.id}/posts/${id}`,"PUT",{revision:post.revision,text:post.text,images});
  check(post.images.length===20,"EDIT_APPEND_RELOAD");
  await request(
    a,
    `/profiles/${p.id}/posts/${id}`,
    "PUT",
    { revision: 1, text: "stale", images },
    409,
  );
  for (const action of ["liked", "saved", "pinned", "reposted", "archived"])
    post = await request(a, `/profiles/${p.id}/posts/${id}`, "PATCH", {
      revision: post.revision,
      action,
      value: true,
    });
  check(
    (await request(a, `/profiles/${p.id}/posts?filter=archive`)).total === 1,
    "ARCHIVE_FILTER",
  );
  post = await request(a, `/profiles/${p.id}/posts/${id}`, "PATCH", {
    revision: post.revision,
    action: "archived",
    value: false,
  });
  let reply = await request(
    a,
    `/profiles/${p.id}/posts/${id}/replies`,
    "POST",
    { id: randomUUID(), text: "Hosted reply" },
  );
  reply = await request(
    a,
    `/profiles/${p.id}/posts/${id}/replies/${reply.id}`,
    "PUT",
    { revision: reply.revision, text: "Hosted edited reply" },
  );
  check(
    (await request(a, `/profiles/${p.id}/reply-feed`)).total === 1,
    "REPLY_FEED",
  );
  await request(a, `/profiles/${q.id}/posts/${id}`, "GET", undefined, 404);
  await request(
    a,
    `/profiles/${q.id}/images/${images[0]}`,
    "GET",
    undefined,
    404,
  );
  await request(b, `/profiles/${p.id}/posts`, "GET", undefined, 404);
  await request(
    b,
    `/profiles/${p.id}/posts/${id}`,
    "PUT",
    { revision: post.revision, text: "cross-owner", images: [] },
    404,
  );
  await request(
    b,
    `/profiles/${p.id}/images/${images[0]}`,
    "GET",
    undefined,
    404,
  );
  await request(
    null,
    `/profiles/${p.id}/images/${images[0]}`,
    "GET",
    undefined,
    401,
  );
  check(
    (await request(b, "/state")).profiles.length === 0,
    "OTHER_POS_USER_EMPTY",
  );
  a.token = await login(a);
  const persisted = await request(a, `/profiles/${p.id}/posts/${id}`);
  check(
    persisted.text === post.text &&
      persisted.images.length === 20 &&
      persisted.replies[0]?.text === "Hosted edited reply" &&
      persisted.liked &&
      persisted.saved &&
      persisted.pinned &&
      persisted.repostedAt,
    "NEW_LOGIN_SERVER_PERSISTENCE",
  );
  const importedId = randomUUID(),
    importBody = {
      id: importedId,
      text: "Hosted legacy record",
      images: [],
      legacyKey: "qa:" + importedId,
      createdAt: 1600000000000,
      liked: true,
      replies: [
        {
          id: randomUUID(),
          text: "Preserved legacy reply",
          createdAt: 1600000001000,
        },
      ],
    };
  await request(a, `/profiles/${p.id}/posts`, "POST", importBody);
  const imported = await request(a, `/profiles/${p.id}/posts`, "POST", {
    ...importBody,
    text: "must not replace",
  });
  check(
    imported.text === importBody.text &&
      imported.createdAt === 1600000000000 &&
      imported.replyCount === 1,
    "ATOMIC_LEGACY_DATES_IDEMPOTENCY",
  );
  const invalidId = randomUUID();
  await request(
    a,
    `/profiles/${p.id}/posts`,
    "POST",
    {
      ...importBody,
      id: invalidId,
      legacyKey: "qa:" + invalidId,
      replies: [{ id: randomUUID(), text: "" }],
    },
    400,
  );
  await request(
    a,
    `/profiles/${p.id}/posts/${invalidId}`,
    "GET",
    undefined,
    404,
  );
  await request(
    a,
    `/profiles/${p.id}/posts/${id}/replies/${reply.id}/delete`,
    "POST",
    { revision: reply.revision, confirm: true },
  );
  await request(a, `/profiles/${q.id}/delete`, "POST", {
    revision: q.revision,
    confirm: true,
  });
  await request(
    a,
    `/profiles/${p.id}/delete`,
    "POST",
    { revision: p.revision, confirm: true },
    409,
  );
  await request(a, `/profiles/${q.id}/posts`, "GET", undefined, 404);
  report.status = "PASS";
  report.imagesVerified = 21;
  report.attachmentBatches = [0,1,2,3,4,20];
  report.sharedAssetDeletionSafety = "Batch posts were deleted while the same media remained attachable/readable by another post";
  report.identities = 2;
  report.normalAuthAcrossLogins = true;
} catch (error) {
  report.status = "FAIL";
  report.reason = /^[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "HOSTED_LOG_QA_FAILED";
  process.exitCode = 1;
} finally {
  const cleanup = {
    data: "NOT_CREATED",
    auth: actors.length ? "PRESERVED_FOR_RECOVERY" : "NOT_CREATED",
  };
  if (actors.length)
    try {
      const verified = [];
      for (const actor of actors) {
        const r = await authRequest("/admin/users/" + actor.id, "GET");
        const user = await r.json();
        if (
          !r.ok ||
          user.email !== actor.email ||
          user.user_metadata?.qaRunId !== runId
        )
          throw Error("SYNTHETIC_IDENTITY_FENCE");
        verified.push(actor.id);
      }
      const out = execFileSync(
        "pwsh.exe",
        [
          "-NoProfile",
          "-Command",
          `railway.cmd run --project ${project} --environment ${environment} --service eba7d263-7dc3-448a-a6b8-c2994721b597 --no-local -- node qa/log-hosted-fixture-cleanup.mjs ${runId} ${verified.join(" ")}`,
        ],
        {
          env: systemEnv(),
          encoding: "utf8",
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 300000,
          cwd: root,
        },
      );
      if (!out.includes("SYNTHETIC_LOG_CLEANUP_PASS"))
        throw Error("DATA_CLEANUP_FAILED");
      cleanup.data = "PASS";
    } catch {
      cleanup.data = "FAIL";
    }
  if (actors.length && cleanup.data === "PASS")
    try {
      for (const actor of actors) {
        const r = await authRequest("/admin/users/" + actor.id, "DELETE");
        if (!r.ok && r.status !== 404) throw Error("AUTH_CLEANUP_FAILED");
      }
      cleanup.auth = "PASS";
    } catch {
      cleanup.auth = "FAIL";
    }
  report.cleanup = cleanup;
  report.finishedAt = new Date().toISOString();
  if (Object.values(cleanup).includes("FAIL")) {
    report.status = "FAIL_CLEANUP";
    report.fixtureRecovery = { runId, owners: actors.map((a) => a.id) };
    process.exitCode = 1;
  }
  await fs.mkdir(evidenceDir,{recursive:true});
  await fs.writeFile(
    path.join(evidenceDir,"hosted-dev-qa.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
