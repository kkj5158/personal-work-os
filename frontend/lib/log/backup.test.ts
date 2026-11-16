import test from "node:test";
import assert from "node:assert/strict";
import { exportBackup, parseBackup, stableId } from "./backup";
import { JSDOM } from "jsdom";
import type { State } from "./api";

const date = 1600000000000;
test("V1 comments/photos and string drafts preserve content, flags, dates and line breaks", () => {
  const b = parseBackup({
    profile: { name: "Legacy", bio: "line1\nline2" },
    draft: "draft",
    posts: [
      {
        id: "p1",
        text: "one\ntwo",
        photos: ["data:image/png;base64,aGVsbG8="],
        comments: [{ id: "c1", text: "child", createdAt: date }],
        createdAt: date,
        pinned: true,
        saved: true,
      },
    ],
  });
  assert.equal(b.profiles[0].draft.text, "draft");
  assert.equal(b.profiles[0].posts[0].text, "one\ntwo");
  assert.equal(b.profiles[0].posts[0].replies[0].createdAt, date);
  assert.equal(b.profiles[0].posts[0].images.length, 1);
  assert.equal(b.profiles[0].posts[0].pinned, true);
  assert.equal(b.profiles[0].posts[0].saved, true);
});
test("V3 multi-profile drafts and content stay in their source profile", () => {
  const b = parseBackup({
    version: 3,
    profiles: [
      {
        id: "one",
        profile: { name: "One", handle: "one" },
        draft: { text: "first", images: [] },
        posts: [{ id: "a", text: "first post", createdAt: date }],
      },
      {
        id: "two",
        profile: { name: "Two", handle: "two" },
        draft: { text: "second", images: [] },
        posts: [],
      },
    ],
  });
  assert.equal(b.profiles.length, 2);
  assert.equal(b.profiles[0].posts.length, 1);
  assert.equal(b.profiles[1].posts.length, 0);
  assert.equal(b.profiles[1].draft.text, "second");
});
test("server V4 backup resolves private media only from embedded data, preserving timestamps", () => {
  const b = parseBackup({
    kind: "POS_LOG_SERVER",
    version: 4,
    ownerId: "owner",
    media: { image1: "data:image/jpeg;base64,YQ==" },
    profiles: [
      {
        id: "id",
        profile: { name: "Name", handle: "name", avatar: "image1" },
        draft: { text: "", images: [] },
        posts: [
          {
            text: "photo",
            images: ["image1"],
            createdAt: date,
            updatedAt: date + 10,
            repostedAt: date + 20,
          },
        ],
      },
    ],
  });
  assert.equal(b.serverOwner, "owner");
  assert.equal(b.profiles[0].avatar, "data:image/jpeg;base64,YQ==");
  assert.equal(b.profiles[0].posts[0].updatedAt, date + 10);
  assert.equal(b.profiles[0].posts[0].repostedAt, date + 20);
});
test("untrusted URLs and active image formats are never fetched; skipped references are reported", () => {
  const b = parseBackup({
    profile: { name: "Unsafe" },
    posts: [
      {
        text: "preserved",
        images: [
          "https://evil.invalid/track",
          "javascript:alert(1)",
          "data:image/svg+xml;base64,YQ==",
        ],
        createdAt: date,
      },
    ],
  });
  assert.equal(b.profiles[0].posts[0].images.length, 0);
  assert.equal(b.warnings.length, 3);
});
test("invalid records and excessive attachments fail preview instead of truncating silently", () => {
  for (const post of [
    { text: "x".repeat(50001) },
    { text: "x", images: Array(101).fill("data:image/png;base64,YQ==") },
    { text: "", images: [] },
    { text: "ok", replies: [{ text: "" }] },
  ])
    assert.throws(() =>
      parseBackup({ profile: { name: "Name" }, posts: [post] }),
    );
  assert.throws(() => parseBackup({ foo: "bar" }));
});
test("stable import IDs are idempotent and isolated by owner and profile", async () => {
  const a = await stableId("owner-a:profile-a:record-a");
  assert.equal(a, await stableId("owner-a:profile-a:record-a"));
  assert.notEqual(a, await stableId("owner-b:profile-a:record-a"));
  assert.notEqual(a, await stableId("owner-a:profile-b:record-a"));
  assert.match(
    a,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/,
  );
});
test("duplicate source IDs fail the preview and unnamed legacy profiles do not mix identities", () => {
  const first = {
    profile: { name: "One" },
    posts: [
      { id: "same", text: "one", createdAt: date },
      { id: "same", text: "two", createdAt: date },
    ],
  };
  assert.throws(() => parseBackup(first), /중복 ID/);
  const one = parseBackup({ profile: { name: "One" }, posts: [] }),
    two = parseBackup({ profile: { name: "Two" }, posts: [] });
  assert.notEqual(one.profiles[0].sourceId, two.profiles[0].sourceId);
});
test("JSON export contains archived records, all replies, drafts and private image bytes in a connected download", async () => {
  const dom = new JSDOM("<body></body>", { url: "http://localhost" });
  const original = {
    document: globalThis.document,
    FileReader: globalThis.FileReader,
    fetch: globalThis.fetch,
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
  };
  let captured: Blob | undefined,
    connected = false;
  class Reader {
    result = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then((bytes) => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`;
        this.onload?.();
      });
    }
  }
  Object.assign(globalThis, {
    document: dom.window.document,
    FileReader: Reader,
  });
  URL.createObjectURL = (blob) => {
    captured = blob as Blob;
    return "blob:log-export";
  };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () {
    connected = this.isConnected;
  };
  const post = (id: string, archived = false) => ({
    id,
    text: id,
    images: ["image1"],
    createdAt: date,
    revision: 1,
    archived,
    replies: [],
    replyCount: 0,
  });
  globalThis.fetch = async (input) => {
    const path = String(input);
    if (path.includes("/images/"))
      return new Response("private-image", {
        headers: { "Content-Type": "image/png" },
      });
    if (path.endsWith("/draft"))
      return Response.json({
        text: "draft text",
        images: ["image2"],
        revision: 2,
      });
    if (path.includes("/replies?"))
      return Response.json({
        replies: [
          {
            id: "reply",
            text: "complete discussion",
            createdAt: date,
            revision: 1,
          },
        ],
        nextOffset: null,
      });
    return Response.json({
      posts: [
        post(
          path.includes("filter=archive") ? "archived" : "normal",
          path.includes("filter=archive"),
        ),
      ],
      nextOffset: null,
    });
  };
  try {
    await exportBackup(
      {
        ownerId: "owner",
        activeProfileId: "profile",
        storageEnabled: true,
        profiles: [
          {
            id: "profile",
            name: "Profile",
            handle: "profile",
            bio: "bio",
            avatar: "image1",
            revision: 1,
          },
        ],
      } satisfies State,
      () => {},
    );
    assert.equal(connected, true);
    assert.ok(captured);
    const data = JSON.parse(await captured.text());
    assert.equal(data.kind, "POS_LOG_SERVER");
    assert.equal(data.version, 4);
    assert.equal(data.profiles[0].posts.length, 2);
    assert.equal(data.profiles[0].posts[1].archived, true);
    assert.equal(
      data.profiles[0].posts[0].replies[0].text,
      "complete discussion",
    );
    assert.equal(data.profiles[0].draft.text, "draft text");
    assert.equal(Object.keys(data.media).length, 2);
    assert.match(data.media.image1, /^data:image\/png;base64,/);
  } finally {
    Object.assign(globalThis, {
      document: original.document,
      FileReader: original.FileReader,
      fetch: original.fetch,
    });
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    dom.window.close();
  }
});
