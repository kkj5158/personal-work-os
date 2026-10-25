import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import type { Challenge, DietData, DietStore } from "@/lib/diet/types";
import { apiClient } from "@/lib/api/client";
import { ChallengeDetail, challengeStatus } from "./ChallengeDetail";
import { useChallengeDrafts } from "./useChallengeDrafts";

const make = (): Challenge => ({ id: "a", title: "보존할 목표", role: "CURRENT_FOCUS", homeSortOrder: 0, type: "WEIGHT", status: "ACTIVE", startDate: "2026-10-01", endDate: "2026-11-30", color: "#4477cc", keyPoint: "설명 유지", notes: ["메모 유지"], sortOrder: 0, startWeight: 100, targetWeight: 90, itemIds: [], goalMode: "RATE", includeMissing: true, currentValue: null, targetValue: null });

test("future display leaves persisted lifecycle intact and unsupported progress stays unknown", () => {
  const c = make(); c.startDate = "2026-11-01";
  assert.equal(challengeStatus(c, "2026-10-25"), "시작 예정");
  assert.equal(c.status, "ACTIVE");
  c.status = "STOPPED"; assert.equal(challengeStatus(c, "2026-10-25"), "중단");
});

test("new type-specific forms retain advanced options and cannot delete an unsaved challenge", () => {
  const noop = async () => {}, c = { ...make(), type: "CHECKLIST" as const, itemIds: ["item"], targetValue: 80 };
  const store: DietStore = { data: { days: [], checks: [], items: [{ id: "item", title: "원본 항목", importance: "CORE", keyPoint: "", sortOrder: 0, weeklyReference: null, monthlyReference: null, active: true, startDate: "2026-01-01" }], challenges: [], milestones: [], goals: [], settings: {} }, busy: false, error: "", save: noop, remove: noop, saveDay: noop, saveCheck: noop, saveSettings: noop, reorderHome: noop, reorder: noop };
  const drafts: ReturnType<typeof useChallengeDrafts> = { drafts: { a: { base: null, value: c } }, change: () => {}, cancel: () => {}, save: noop, remove: noop, changedIds: ["a"], ready: true, saving: false, storageError: "", canPersist: () => true };
  const markup = renderToStaticMarkup(<ChallengeDetail challenge={c} store={store} drafts={drafts}/>);
  assert.ok(markup.includes("대상 체크리스트")); assert.ok(markup.includes("목표 방식")); assert.ok(markup.includes("미입력 포함")); assert.ok(markup.includes("고급 설정"));
  assert.ok(!markup.includes("시작 체중 (kg)")); assert.ok(!markup.includes(">챌린지 삭제</button>"));
  assert.ok(markup.includes("챌린지를 먼저 저장한 뒤")); assert.ok(markup.includes("메모 유지"));
});

test("shared editor preserves ID drafts, uses mobile CAS, keeps failed deletion and protects an unseen concurrent write", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://orbit.local/diet/planner", pretendToBeVisual: true });
  Object.assign(globalThis, { React, window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, CustomEvent: dom.window.CustomEvent, Event: dom.window.Event, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const original = { ...apiClient }, c = make();
  let remote: DietData = { days: [], checks: [], items: [], challenges: [c], goals: [], milestones: [], settings: {} }, version = "v1", failDelete = false;
  const puts: { path: string; body: unknown }[] = [], deletes: string[] = [];
  apiClient.get = async <T,>(path: string) => structuredClone(path === "/api/diet/mobile/plans" ? remote.challenges.map(value => ({ value, version })) : remote) as T;
  apiClient.put = async <T,>(path: string, body: unknown) => {
    puts.push({ path, body }); const input = body as { value: Challenge; expectedVersion: string };
    assert.equal(input.expectedVersion, version); version = "v2"; remote.challenges = [structuredClone(input.value)];
    return { value: input.value, version } as T;
  };
  apiClient.delete = async <T,>(path: string) => { deletes.push(path); if (failDelete) throw new Error("네트워크 삭제 실패"); remote.challenges = []; return undefined as T; };
  let drafts!: ReturnType<typeof useChallengeDrafts>, removed = 0;
  function Harness() {
    const [data, setData] = useState(remote), noop = async () => {};
    const store: DietStore & { reload: () => Promise<void> } = { data, busy: false, error: "", save: noop, remove: async () => assert.fail("legacy unversioned delete must not be used"), saveDay: noop, saveCheck: noop, saveSettings: noop, reorderHome: noop, reorder: noop, acceptChallenge: value => setData(current => ({ ...current, challenges: [value] })), reload: async () => setData(structuredClone(remote)) };
    drafts = useChallengeDrafts(store);
    const selected = drafts.drafts.a?.value ?? data.challenges[0];
    return selected ? <ChallengeDetail challenge={selected} store={store} drafts={drafts} onRemoved={() => removed++}/> : <p>삭제 완료</p>;
  }
  const root = createRoot(document.getElementById("root")!);
  const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); });
  const button = (text: string) => { const b = [...document.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === text); assert.ok(b, text); return b; };
  try {
    await act(async () => { root.render(<Harness/>); await new Promise(resolve => setImmediate(resolve)); }); await flush();
    assert.ok(drafts.ready);
    assert.ok(document.body.textContent?.includes("미집계"), "no measurement must remain unknown");
    assert.equal(document.querySelectorAll('input[type="number"]').length, 2, "weight inputs only");
    assert.ok(document.querySelector('input[type="color"]'), "advanced color remains reachable");
    await act(() => drafts.change({ ...c, title: "수정 목표" }));
    assert.ok(localStorage.getItem("diet-challenge-drafts:v1:loopback-dev")?.includes("수정 목표"));
    await act(() => window.dispatchEvent(new dom.window.StorageEvent("storage", { key: "diet-challenge-drafts:v1:loopback-dev", newValue: JSON.stringify({ a: { base: c, value: { ...c, title: "다른 창 초안" } } }) })));
    assert.equal(drafts.drafts.a.value.title, "수정 목표", "cross-window draft changes preserve active input"); assert.equal(drafts.canPersist(), false);
    await act(async () => { document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); }); await flush();
    assert.equal(puts[0].path, "/api/diet/mobile/plans/a"); assert.equal(remote.challenges[0].title, "수정 목표");
    assert.deepEqual(remote.challenges[0].notes, ["메모 유지"]); assert.equal(remote.challenges[0].keyPoint, "설명 유지"); assert.deepEqual(drafts.changedIds, []);
    await act(() => drafts.change({ ...remote.challenges[0], title: "충돌 초안" }));
    remote = { ...remote, challenges: [{ ...remote.challenges[0], keyPoint: "다른 기기의 변경" }] }; version = "v3";
    await act(async () => drafts.save(["a"]));
    assert.equal(puts.length, 1); assert.ok(drafts.drafts.a.error?.includes("다른 화면")); assert.equal(drafts.drafts.a.value.title, "충돌 초안");
    await act(() => drafts.cancel(["a"]));
    // Reset the server to the displayed baseline, then simulate a transport failure.
    remote.challenges = [{ ...c, title: "수정 목표" }]; failDelete = true;
    await act(() => button("챌린지 삭제").click());
    assert.equal(deletes.length, 0, "opening confirmation cannot delete");
    assert.ok(document.querySelector('[role="dialog"]')?.textContent?.includes("수정 목표"));
    await act(async () => button("챌린지 삭제 확인").click()); await flush();
    assert.equal(deletes[0], "/api/diet/mobile/plans/a?expectedVersion=v3");
    assert.ok(document.body.textContent?.includes("네트워크 삭제 실패")); assert.equal(removed, 0); assert.equal(remote.challenges.length, 1);
    failDelete = false;
    await act(async () => button("챌린지 삭제 확인").click()); await flush();
    assert.equal(removed, 1); assert.equal(remote.challenges.length, 0); assert.ok(document.body.textContent?.includes("삭제 완료"));
  } finally { Object.assign(apiClient, original); await act(() => root.unmount()); dom.window.close(); }
});
