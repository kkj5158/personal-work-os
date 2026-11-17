import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { WorkbookReview } from "./WorkbookReview";
import { WorkbookCreation, GoalEditor } from "./WorkbookCreation";
import { EngineJobSummary } from "./EngineJobSummary";
import { useEngine } from "./useEngine";
import { createStudyPort } from "../../lib/study/port";
import { fixtureSnapshot } from "../../lib/study/fixtures";
import {
  addDays,
  kstDate,
  weekStart,
  type StudyDataPort,
  type AnswerKey,
  type StudyPart,
} from "../../lib/study/model";
import type {
  EngineStatus,
  EngineJob,
  PlanPreview,
} from "../../lib/study/engine";
const baseStatus = (): EngineStatus => ({
  engineEnabled: true,
  workerOnline: false,
  provider: "local",
  paidProvider: "disabled",
  pdf: "ready",
  version: "v2",
  goals: {
    goal: "Saved goal",
    interests: "",
    weeklyTarget: { new: 60, review: 25, application: 15 },
  },
  jobs: [],
  sources: [
    {
      materialId: "lean-startup",
      materialVersion: 1,
      state: "ready",
      active: true,
      included: true,
      usableExcerptCount: 2,
    },
  ],
  workers: [],
  schedule: {
    enabled: false,
    time: "20:00",
    zone: "Asia/Seoul",
    nextRun: new Date().toISOString(),
  },
});
const snapshot = () => ({
  ...fixtureSnapshot(),
  ownerId: "test-owner",
  connection: { state: "ready" as const },
});
const generation: EngineJob = {
  id: "exact-job",
  kind: "GENERATE",
  state: "READY",
  workbookId: "book",
  workbookVersion: 2,
  date: kstDate(),
  week: weekStart(),
  attempts: 1,
  checkpoint: 0,
  updatedAt: new Date().toISOString(),
  receipt: {},
};
function candidate() {
  const p = structuredClone(snapshot().packages[0]);
  p.id = "book";
  p.version = 2;
  p.date = kstDate();
  return p;
}
function keysFor(
  p: ReturnType<typeof candidate>,
  part: StudyPart,
): AnswerKey[] {
  return p[part].map((q) => ({
    binding: {
      workbookId: p.id,
      workbookVersion: p.version,
      part,
      questionId: q.id,
      questionVersion: q.version,
    },
    model: "Exact private answer",
    explanation: "Private explanation",
    rubric: ["rubric"],
    followUp: [],
  }));
}
async function mount() {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost/study",
  });
  Object.assign(globalThis, {
    React,
    window: dom.window,
    document: dom.window.document,
    sessionStorage: dom.window.sessionStorage,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root")!);
  const click = async (text: string) => {
    const b = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent === text,
    );
    assert.ok(b, "button missing: " + text);
    await act(async () => b.click());
  };
  return {
    dom,
    root,
    click,
    close: async () => {
      await act(async () => root.unmount());
      dom.window.close();
    },
  };
}
test("answer review is deliberate, exact-version, followed by a separate explicit approval", async () => {
  const h = await mount(),
    p = candidate(),
    reads: unknown[] = [],
    actions: string[] = [];
  const port = {
    ...createStudyPort("demo"),
    mode: "server",
    getSnapshot: snapshot,
    readAnswerKeys: async (id: string, version: number, part: StudyPart) => {
      reads.push([id, version, part]);
      return keysFor(p, part);
    },
  } as StudyDataPort;
  const props = {
    job: generation,
    pkg: p,
    port,
    jobs: [generation],
    blocked: false,
    action: async (name: string) => {
      actions.push(name);
    },
    back: () => {},
    onOpen: () => {},
  };
  try {
    await act(async () => h.root.render(<WorkbookReview {...props} />));
    assert.deepEqual(reads, []);
    assert.equal(document.querySelectorAll(".study-answer").length, 0);
    assert.ok(
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "검토 후 PDF 발행",
      )!.disabled,
    );
    await h.click("정답·해설·근거 열기");
    assert.deepEqual(reads, [
      ["book", 2, "required"],
      ["book", 2, "extension"],
    ]);
    assert.equal(actions.length, 0);
    assert.equal(
      document.querySelectorAll(".study-answer").length,
      p.required.length + p.extension.length,
    );
    await h.click("검토 후 PDF 발행");
    assert.equal(actions.length, 0);
    assert.match(document.body.textContent!, /book v2/);
    await h.click("이 버전 발행 승인");
    assert.deepEqual(actions, ["jobs/exact-job/approve"]);
    const render = {
      ...generation,
      id: "render",
      kind: "RENDER" as const,
      state: "QUEUED",
    };
    await act(async () =>
      h.root.render(<WorkbookReview {...props} jobs={[generation, render]} />),
    );
    assert.match(
      document.body.textContent!,
      /두 파일 검증이 끝나기 전에는 발행 완료가 아닙니다/,
    );
    assert.equal(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "문제집 열기",
      ),
      false,
    );
    const published = {
      ...p,
      status: "published" as const,
      questionPdf: {
        workbookId: p.id,
        workbookVersion: 2,
        kind: "question" as const,
        state: "ready" as const,
        url: "https://example.test/q.pdf",
      },
      answerExplanationPdf: {
        workbookId: p.id,
        workbookVersion: 2,
        kind: "answer" as const,
        state: "missing" as const,
      },
    };
    await act(async () =>
      h.root.render(
        <WorkbookReview
          {...props}
          pkg={published}
          jobs={[generation, render]}
        />,
      ),
    );
    assert.equal(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "문제집 열기",
      ),
      false,
    );
    await act(async () =>
      h.root.render(
        <WorkbookReview
          {...props}
          pkg={{
            ...published,
            answerExplanationPdf: {
              ...published.answerExplanationPdf,
              state: "ready",
              url: "https://example.test/a.pdf",
            },
          }}
          jobs={[generation, render]}
        />,
      ),
    );
    assert.ok(
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "문제집 열기",
      ),
    );
  } finally {
    await h.close();
  }
});
test("wrong-version private keys never unlock publication", async () => {
  const h = await mount(),
    p = candidate();
  const port = {
    ...createStudyPort("demo"),
    readAnswerKeys: async (_id: string, _version: number, part: StudyPart) =>
      keysFor(p, part).map((k) => ({
        ...k,
        binding: { ...k.binding, workbookVersion: 1 },
      })),
  } as StudyDataPort;
  try {
    await act(async () =>
      h.root.render(
        <WorkbookReview
          job={generation}
          pkg={p}
          port={port}
          jobs={[generation]}
          blocked={false}
          action={async () => {
            throw Error("must not approve");
          }}
          back={() => {}}
          onOpen={() => {}}
        />,
      ),
    );
    await h.click("정답·해설·근거 열기");
    assert.match(document.body.textContent!, /정확한 버전 정답/);
    assert.equal(document.querySelectorAll(".study-answer").length, 0);
    assert.ok(
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent === "검토 후 PDF 발행",
      )!.disabled,
    );
  } finally {
    await h.close();
  }
});
test("extra foreign key with identical question ID cannot replace the exact bound answer", async () => {
  const h = await mount(),
    p = candidate();
  const port = {
    ...createStudyPort("demo"),
    readAnswerKeys: async (_id: string, _version: number, part: StudyPart) => {
      const keys = keysFor(p, part);
      return [
        {
          ...keys[0],
          binding: { ...keys[0].binding, workbookId: "foreign-book" },
          model: "WRONG FOREIGN ANSWER",
        },
        ...keys,
      ];
    },
  } as StudyDataPort;
  try {
    await act(async () =>
      h.root.render(
        <WorkbookReview
          job={generation}
          pkg={p}
          port={port}
          jobs={[generation]}
          blocked={false}
          action={async () => {}}
          back={() => {}}
          onOpen={() => {}}
        />,
      ),
    );
    await h.click("정답·해설·근거 열기");
    assert.ok(
      !document
        .querySelector(".study-review-workspace")!
        .textContent!.includes("WRONG FOREIGN ANSWER"),
    );
  } finally {
    await h.close();
  }
});
test("double clicks and uncertain response reuse one persisted operation after remount", async () => {
  const h = await mount(),
    s = snapshot(),
    status = baseStatus(),
    calls: Record<string, unknown>[] = [];
  let resolve: ((v: unknown) => void) | undefined;
  s.sources[1].included = false;
  status.sources!.push({
    materialId: s.sources[1].id,
    materialVersion: 1,
    state: "ready",
    active: true,
    included: false,
    usableExcerptCount: 2,
  });
  const preview: PlanPreview = {
    date: addDays(weekStart(), 7),
    policy: s.policies[0],
    goals: status.goals,
    minutes: { required: 15, extension: 30 },
    questionFormat: {
      required: { single_choice: 5, essay: 1 },
      extension: { case_analysis: 2 },
    },
    sourceLimit: 4,
  };
  const port = {
    ...createStudyPort("demo"),
    mode: "server",
    getSnapshot: () => s,
    engine: {
      status: async () => status,
      search: async () => [],
      preview: async () => preview,
      action: async (_name: string, data: unknown) => {
        calls.push(structuredClone(data) as Record<string, unknown>);
        if (calls.length === 1)
          return new Promise((r) => {
            resolve = r;
          });
        throw Error("uncertain network");
      },
    },
  } as StudyDataPort;
  const props = {
    port,
    snapshot: s,
    status,
    onRequested: () => {},
    onMaterials: () => {},
    saveGoals: async () => {},
    blocked: false,
  };
  try {
    await act(async () => h.root.render(<WorkbookCreation {...props} />));
    const primary = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((b) => b.textContent === "선택한 구성으로 생성 요청")!;
    assert.ok(!primary.disabled);
    await act(async () => {
      primary.click();
      primary.click();
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].date, addDays(weekStart(), 7));
    assert.equal(calls[0].days, 7);
    assert.deepEqual(calls[0].materialIds, ["lean-startup"]);
    await act(async () => resolve!([]));
    await h.click("같은 요청 다시 확인");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].operationId, calls[1].operationId);
    await act(async () => h.root.render(<div />));
    await act(async () => h.root.render(<WorkbookCreation {...props} />));
    await h.click("같은 요청 다시 확인");
    assert.equal(calls.length, 3);
    assert.equal(calls[2].operationId, calls[0].operationId);
    assert.equal(status.schedule.enabled, false);
  } finally {
    await h.close();
  }
});
test("polling new goal props preserves an edited unsaved goal", async () => {
  const h = await mount(),
    goals = baseStatus().goals;
  let saved: unknown;
  try {
    await act(async () =>
      h.root.render(
        <GoalEditor
          goals={goals}
          disabled={false}
          save={async (g) => {
            saved = g;
          }}
        />,
      ),
    );
    const input = document.querySelector("textarea")!,
      setter = Object.getOwnPropertyDescriptor(
        h.dom.window.HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
    await act(async () => {
      setter.call(input, "Unsaved owner draft");
      input.dispatchEvent(new h.dom.window.Event("input", { bubbles: true }));
    });
    assert.equal(input.value, "Unsaved owner draft");
    await act(async () =>
      h.root.render(
        <GoalEditor
          goals={{ ...goals, goal: "New server poll value" }}
          disabled={false}
          save={async (g) => {
            saved = g;
          }}
        />,
      ),
    );
    assert.equal(
      document.querySelector("textarea")!.value,
      "Unsaved owner draft",
    );
    await h.click("학습 구성 저장");
    assert.equal((saved as { goal: string }).goal, "Unsaved owner draft");
  } finally {
    await h.close();
  }
});
test("history stays bounded to server pages and forwards period and state filters", async () => {
  const h = await mount(),
    requests: { page: number; filters: unknown }[] = [],
    jobs = Array.from({ length: 50 }, (_, i) => ({
      ...generation,
      id: "job-" + i,
    }));
  const port = {
    ...createStudyPort("demo"),
    engine: {
      status: async () => baseStatus(),
      action: async () => {},
      search: async () => [],
      history: async (page: number, filters: unknown) => {
        requests.push({ page, filters });
        return {
          jobs: page === 0 ? jobs : [{ ...generation, id: "last-job" }],
          page,
          totalPages: 2,
          totalElements: 51,
        };
      },
    },
  } as StudyDataPort;
  try {
    await act(async () => {
      h.root.render(
        <EngineJobSummary
          port={port}
          jobs={[]}
          blocked={false}
          action={async () => {}}
          initialWeek={weekStart()}
        />,
      );
    });
    assert.equal(document.querySelectorAll(".study-history-row").length, 50);
    assert.deepEqual(requests[0], { page: 0, filters: { week: weekStart() } });
    await h.click("다음 이력");
    assert.equal(document.querySelectorAll(".study-history-row").length, 1);
    assert.equal(requests.at(-1)!.page, 1);
    const state = document.querySelectorAll("select")[1];
    await act(async () => {
      state.value = "FAILED";
      state.dispatchEvent(new h.dom.window.Event("change", { bubbles: true }));
    });
    assert.deepEqual(requests.at(-1), {
      page: 0,
      filters: { week: weekStart(), state: "FAILED" },
    });
    await h.click("전체 기간 보기");
    assert.deepEqual(requests.at(-1), { page: 0, filters: {} });
  } finally {
    await h.close();
  }
});
test("late engine status response cannot overwrite a newer refresh", async () => {
  const h = await mount(),
    resolvers: ((value: EngineStatus) => void)[] = [];
  let api: ReturnType<typeof useEngine> | undefined;
  const s = snapshot(),
    port = {
      ...createStudyPort("demo"),
      getSnapshot: () => s,
      engine: {
        status: () =>
          new Promise<EngineStatus>((resolve) => resolvers.push(resolve)),
        action: async () => {},
        search: async () => [],
      },
    } as StudyDataPort;
  function Probe() {
    api = useEngine(port);
    return <p>{api.status?.version ?? "pending"}</p>;
  }
  try {
    await act(async () => {
      h.root.render(<Probe />);
    });
    assert.equal(resolvers.length, 1);
    const fresh = api!.refresh();
    assert.equal(resolvers.length, 2);
    await act(async () => {
      resolvers[1]({ ...baseStatus(), version: "newer" });
      await fresh;
    });
    assert.equal(document.body.textContent, "newer");
    await act(async () => {
      resolvers[0]({ ...baseStatus(), version: "stale" });
    });
    assert.equal(document.body.textContent, "newer");
  } finally {
    await h.close();
  }
});
