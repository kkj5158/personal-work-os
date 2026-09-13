"use client";

import { useState, type CSSProperties } from "react";
import { Settings2, Target, TrendingDown, Trophy } from "lucide-react";
import type { Challenge, DietSettings, DietStore, WeightGoal } from "@/lib/diet/types";
import { challengeProgress, goalFor, latestWeight, monthStart, today, weekStart } from "@/lib/diet/model";
import { WorkLogModal } from "../worklog/WorkLogModal";
import { SortableList } from "./SortableList";
import { WeightChart } from "./Charts";
import "./home-chart.css";

const weight = (value: number | null | undefined) => value == null ? "—" : `${value.toFixed(1)} kg`;
const percent = (value: number | null) => value == null ? "—" : `${Math.round(value)}%`;
const ratio = (start: number | null, current: number | null, target: number | null | undefined) => start == null || current == null || target == null ? null : start === target ? (current <= target ? 100 : 0) : Math.max(0, Math.min(100, (start - current) / (start - target) * 100));
function ProgressBar({ value }: { value: number | null }) { return <div className="diet-home-progress"><div role="progressbar" aria-label="목표 진행률" aria-valuenow={value == null ? undefined : Math.round(value)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></div><b>{percent(value)}</b></div>; }
function Change({ value }: { value: number | null }) { return <strong className={value != null && value < 0 ? "diet-weight-loss" : ""}>{value == null ? "—" : `${value < 0 ? "▼" : value > 0 ? "▲" : ""} ${Math.abs(value).toFixed(1)} kg`}</strong>; }

export default function Home({ store }: { store: DietStore }) {
  const { data } = store;
  const [kind, setKind] = useState<WeightGoal["kind"]>("SHORT_TERM");
  const [heroOpen, setHeroOpen] = useState(false);
  const hero = data.settings.hero ?? { backgroundImage: "", primaryText: "오늘의 선택을 꾸준히 기록하세요.", secondaryText: "작은 변화가 쌓이는 나의 건강 기록" };
  const recordedDays = data.days.filter(d => d.date <= today() && d.morningWeight != null).sort((a, b) => a.date.localeCompare(b.date));
  const current = latestWeight(recordedDays);
  const finalGoal = goalFor(data, "FINAL");
  const finalChallenge = data.challenges.find(c => c.id === finalGoal?.challengeId);
  const startWeight = finalChallenge?.startWeight ?? recordedDays[0]?.morningWeight ?? null;
  const selectedGoal = goalFor(data, kind);
  const selectedChallenge = data.challenges.find(c => c.id === selectedGoal?.challengeId);
  const selectedStart = selectedChallenge?.startWeight ?? startWeight;
  const active = data.challenges.filter(c => c.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder);
  const changeSince = (date: string) => {
    const baseline = recordedDays.find(day => day.date >= date)?.morningWeight;
    return current == null || baseline == null ? null : current - baseline;
  };
  function reorderActive(ids: string[]) {
    let index = 0;
    const ordered = [...data.challenges].sort((a, b) => a.sortOrder - b.sortOrder).map(challenge => challenge.status === "ACTIVE" ? ids[index++] : challenge.id);
    void store.reorder("challenges", ordered).catch(() => {});
  }
  return <div className="diet-home">
    <section className={`diet-home-hero ${hero.backgroundImage ? "has-image" : ""}`} style={hero.backgroundImage ? { backgroundImage: `linear-gradient(90deg,rgba(245,248,251,.94),rgba(245,248,251,.4)),url(${JSON.stringify(hero.backgroundImage)})` } : undefined}>
      <div><h2>{hero.primaryText}</h2><p>{hero.secondaryText}</p></div>
      <button type="button" onClick={() => setHeroOpen(true)} aria-label="홈 문구와 배경 설정"><Settings2 size={17} /></button>
    </section>
    <div className="diet-home-goals">
      <section className="diet-home-panel"><header><h2><Target size={17} />전체 목표 감량 진행률</h2></header>
        <div className="diet-home-panel-body">
          <div className="diet-home-stats"><div><span>시작 체중</span><strong>{weight(startWeight)}</strong></div><div><span>현재 체중</span><strong>{weight(current)}</strong><small className={current != null && startWeight != null && current < startWeight ? "diet-weight-loss" : ""}>{current == null || startWeight == null ? "" : `${current < startWeight ? "▼" : "▲"} ${Math.abs(current - startWeight).toFixed(1)} kg`}</small></div><div><span>최종 목표</span><strong>{weight(finalGoal?.value)}</strong><small>{current == null || !finalGoal ? "플래너에서 목표 설정" : `${Math.max(0, current - finalGoal.value).toFixed(1)} kg 남음`}</small></div></div>
          <ProgressBar value={ratio(startWeight, current, finalGoal?.value)} />
        </div>
      </section>
      <section className="diet-home-panel"><header><h2><Target size={17} />선택 목표 진행률</h2><div className="diet-home-tabs" role="group" aria-label="목표 기간">{([["SHORT_TERM", "단기"], ["WEEKLY", "주"], ["MONTHLY", "월"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div></header>
        <div className="diet-home-panel-body"><div className="diet-home-stats"><div><span>선택 목표</span><strong>{weight(selectedGoal?.value)}</strong><small>{selectedGoal?.date ?? "플래너에서 목표 설정"}</small></div><div><span>현재 체중</span><strong>{weight(current)}</strong></div><div><span>필요 감량</span><strong className="diet-weight-loss">{current == null || !selectedGoal ? "—" : weight(Math.max(0, current - selectedGoal.value))}</strong></div></div><ProgressBar value={ratio(selectedStart, current, selectedGoal?.value)} /></div>
      </section>
    </div>
    <section className="diet-home-panel"><header><h2><TrendingDown size={17} />체중 변화 추이</h2><span className="diet-home-muted">목표·기준선은 통계와 공유됩니다</span></header><div className="diet-home-panel-body"><WeightChart data={data} /><div className="diet-home-changes"><div><span>이번 주 변화</span><Change value={changeSince(weekStart(today()))} /></div><div><span>이번 달 변화</span><Change value={changeSince(monthStart(today()))} /></div><div><span>시작 대비 변화</span><Change value={current == null || startWeight == null ? null : current - startWeight} /></div></div></div></section>
    <section className="diet-home-panel"><header><h2><Trophy size={17} />진행 중인 챌린지</h2><span className="diet-home-muted">핸들을 드래그해 순서 변경</span></header>
      {active.length === 0 ? <div className="diet-chart-empty">진행 중인 챌린지가 없습니다. 플래너에서 챌린지를 설정하세요.</div> : <SortableList ids={active.map(c => c.id)} onReorder={reorderActive}>{(id, handle) => {
        const challenge = active.find(c => c.id === id)!;
        return <div className="diet-home-challenge" style={{ "--challenge-color": challenge.color } as CSSProperties}>{handle}<ChallengeCard challenge={challenge} store={store} /></div>;
      }}</SortableList>}
    </section>
    {heroOpen && <HeroSettings hero={hero} store={store} onClose={() => setHeroOpen(false)} />}
  </div>;
}

function ChallengeCard({ challenge, store }: { challenge: Challenge; store: DietStore }) {
  const progress = challengeProgress(challenge, store.data);
  const unit = challenge.type === "WEIGHT" ? " kg" : challenge.type === "CHECKLIST" && challenge.goalMode === "RATE" ? "%" : challenge.type === "CHECKLIST" ? "회" : "";
  const valueText = (value: number | null) => value == null ? "—" : `${Number(value.toFixed(challenge.type === "WEIGHT" ? 1 : 0))}${unit}`;
  return <><div className="diet-home-challenge-title"><h3>{challenge.title}</h3><span className="diet-home-type">{challenge.type === "WEIGHT" ? "체중" : challenge.type === "CHECKLIST" ? "체크리스트" : "직접 설정"} · 진행 중</span><p>{challenge.startDate} – {challenge.endDate}</p></div><div className="diet-home-challenge-metric"><div><span>현재 <b>{valueText(progress.current)}</b></span><span>목표 <b>{valueText(progress.target)}</b></span></div><ProgressBar value={progress.progress} />{challenge.type === "WEIGHT" && <small><span className={progress.lost != null && progress.lost > 0 ? "diet-weight-loss" : ""}>{progress.lost == null ? "—" : `${Math.abs(progress.lost).toFixed(1)} kg ${progress.lost >= 0 ? "감량" : "증가"}`}</span> · {progress.remaining == null ? "—" : `${Math.max(0, progress.remaining).toFixed(1)} kg 남음`}</small>}{challenge.type === "CHECKLIST" && <small>성공 {progress.success}회 / 대상 {progress.eligible}회</small>}</div><div className="diet-home-challenge-notes"><span>핵심</span><p>{challenge.keyPoint || "—"}</p></div><div className="diet-home-challenge-notes"><span>메모</span>{challenge.notes.length ? <ul>{challenge.notes.map((note, i) => <li key={i}>{note}</li>)}</ul> : <p>—</p>}</div></>;
}

function HeroSettings({ hero, store, onClose }: { hero: NonNullable<DietSettings["hero"]>; store: DietStore; onClose: () => void }) {
  const [draft, setDraft] = useState(hero);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return <WorkLogModal titleId="diet-hero-settings" title="홈 문구와 배경" onClose={onClose} footer={<><button type="button" onClick={onClose}>취소</button><button type="submit" form="diet-hero-form" disabled={saving}>{saving ? "저장 중…" : "저장"}</button></>}><form id="diet-hero-form" className="diet-home-hero-form" onSubmit={async e => { e.preventDefault(); setSaving(true); setError(""); try { await store.saveSettings({ ...store.data.settings, hero: draft }); onClose(); } catch (error) { setError(error instanceof Error ? error.message : "저장하지 못했습니다."); } finally { setSaving(false); } }}><label>메인 문구<input required maxLength={160} value={draft.primaryText} data-autofocus onChange={e => setDraft({ ...draft, primaryText: e.target.value })} /></label><label>보조 문구<input maxLength={240} value={draft.secondaryText} onChange={e => setDraft({ ...draft, secondaryText: e.target.value })} /></label><label>배경 이미지 URL<input type="url" value={draft.backgroundImage} placeholder="https://… (비워두면 기본 배경)" onChange={e => setDraft({ ...draft, backgroundImage: e.target.value })} /></label>{error && <p role="alert">{error}</p>}</form></WorkLogModal>;
}
