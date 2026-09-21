// Explicit DEV-only API smoke. Creates uniquely named fixtures and removes only
// those fixtures in finally. Run against an owned runtime connected to DEV.
import assert from 'node:assert/strict';

const base = process.env.CALENDAR_QA_URL ?? 'http://localhost:8085';
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error('DEV localhost required');
const tag = `Calendar simple QA ${Date.now()}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const shift = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const past = shift(today, -1), future = shift(today, 1);
const refs = new Map();
const remember = ref => { refs.set(`${ref.kind}:${ref.id}`, ref); return ref; };
let category;
async function api(path, method = 'GET', body, expected) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  if (expected) { assert.equal(res.status, expected, `${path}: ${text}`); return; }
  assert.ok(res.ok, `${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}
const range = date => api(`/api/calendar?from=${date}&to=${date}`);
const minutes = r => [...r.actualBlocks, ...r.unscheduledActual].reduce((n, a) => n + a.durationMinutes, 0);
const plans = r => [...r.planBlocks, ...r.unscheduledPlans];
const actualBody = (date, extra = {}) => ({ date, categoryId: category.id, title: tag, durationMinutes: 30, startTime: '23:00', endTime: '23:30', memo: 'DEV disposable fixture', phaseId: null, ...extra });
async function plan(date, extra = {}) {
  const p = await api('/api/planned-blocks', 'POST', { domainType: 'LIFE', title: tag, date, startAt: `${date}T23:00`, endAt: `${date}T23:30`, lifeCategoryId: category.id, memo: 'DEV disposable fixture', ...extra });
  return remember({ kind: 'PLAN', id: p.id });
}
async function actual(date, extra = {}) {
  const a = await api('/api/calendar/actual/LIFE_TIME_ENTRY', 'POST', actualBody(date, extra));
  return remember({ kind: 'ACTUAL', sourceType: 'LIFE_TIME_ENTRY', id: a.id });
}
async function convert(ref, targetState, extra = {}) {
  return remember(await api('/api/calendar/state', 'POST', { ...ref, targetState, ...extra }));
}
const pass = label => console.log(`PASS ${label}`);

try {
  category = await api('/api/life-categories', 'POST', { name: tag });
  const baseline = minutes(await range(today));
  const p = await plan(today);
  assert.equal(minutes(await range(today)), baseline);
  const a = await convert(p, 'ACTUAL');
  let r = await range(today);
  assert.equal(minutes(r), baseline + 30);
  assert.ok(!plans(r).some(x => x.id === p.id));
  assert.equal(r.actualBlocks.filter(x => x.sourceId === a.id).length, 1);
  await convert(p, 'ACTUAL'); // same request is idempotent, not a second source
  assert.equal(minutes(await range(today)), baseline + 30);
  const back = await convert(a, 'PLAN');
  assert.equal(back.id, p.id);
  assert.equal(minutes(await range(today)), baseline);
  assert.ok(plans(await range(today)).some(x => x.id === p.id));
  pass('Plan excluded; conversion included once; reload projection single; correction excluded');

  const futurePlan = await plan(future);
  await api('/api/calendar/state', 'POST', { ...futurePlan, targetState: 'ACTUAL' }, 400);
  await api('/api/calendar/actual/LIFE_TIME_ENTRY', 'POST', actualBody(future), 400);
  assert.ok(plans(await range(future)).some(x => x.id === futurePlan.id));
  const laterToday = await convert(p, 'ACTUAL');
  const saved = await api(`/api/calendar/actual/LIFE_TIME_ENTRY/${laterToday.id}`);
  assert.equal(saved.startTime, '23:00:00');
  const futureClockPlan = await plan(today, { startAt: `${today}T23:50`, endAt: `${today}T23:55` });
  const futureClockActual = await convert(futureClockPlan, 'ACTUAL');
  assert.equal((await api(`/api/calendar/actual/LIFE_TIME_ENTRY/${futureClockActual.id}`)).startTime, '23:50:00');
  pass('today later-clock accepted; tomorrow creation/conversion rejected without losing Plan');

  const pastPlan = await plan(past, { startAt: `${past}T21:00`, endAt: `${past}T21:30` });
  await convert(pastPlan, 'ACTUAL');
  await actual(past, { startTime: '20:00', endTime: '20:30' });
  pass('past conversion and direct historical Actual creation');

  const workdays = await api(`/api/work-records?from=${today.slice(0, 7)}-01&to=${today}`);
  const workday = workdays.find(x => x.status === 'WORK');
  assert.ok(workday, 'DEV smoke requires an existing WORK day; never fabricate WorkRecord');
  const categories = await api('/api/activity-categories');
  const workCategory = categories.find(x => x.isActive && x.parentId);
  assert.ok(workCategory);
  const wp = await plan(workday.workDate, { domainType: 'WORK', lifeCategoryId: null, activityCategoryId: workCategory.id, startAt: `${workday.workDate}T23:35`, endAt: `${workday.workDate}T23:40` });
  const wa = await convert(wp, 'ACTUAL');
  const included = await api(`/api/work-records/${workday.workDate}`);
  assert.equal(included.netWorkMinutes, workday.netWorkMinutes + 5);
  assert.ok(included.version > workday.version, 'Calendar must invalidate stale WorkLog aggregate edits');
  await convert(wa, 'PLAN');
  assert.equal((await api(`/api/work-records/${workday.workDate}`)).netWorkMinutes, workday.netWorkMinutes);
  pass('WORK source statistics include once/remove; WorkRecord revision advances');

  const snapshot = await api('/api/calendar/clipboard/snapshot', 'POST', [laterToday]);
  const items = [past, today, future].map(date => ({ ...snapshot[0], actual: { ...snapshot[0].actual, date } }));
  const pasted = await api('/api/calendar/clipboard/paste', 'POST', { items, excludeConflicts: false });
  assert.equal(pasted.committed, true);
  assert.deepEqual(pasted.results.map(x => x.created.kind), ['ACTUAL', 'ACTUAL', 'PLAN']);
  pasted.results.forEach(x => remember(x.created));
  const copy = plans(await range(future)).find(x => x.id === pasted.results[2].created.id);
  assert.equal(copy.title, tag);
  assert.equal(copy.startAt.slice(11, 16), '23:00');
  assert.equal(copy.endAt.slice(11, 16), '23:30');
  const planSnapshot = await api('/api/calendar/clipboard/snapshot', 'POST', [futurePlan]);
  const planPaste = await api('/api/calendar/clipboard/paste', 'POST', { items: planSnapshot, excludeConflicts: false });
  assert.equal(planPaste.results[0].created.kind, 'PLAN');
  remember(planPaste.results[0].created);
  pass('mixed-date Actual paste independently maps past/today/future; Plan stays Plan; duration preserved');

  const moved = await api('/api/calendar/clipboard/move', 'POST', { refs: [laterToday], items: [{ ...snapshot[0], actual: { ...snapshot[0].actual, date: future } }] });
  assert.ok(![...(await range(future)).actualBlocks, ...(await range(future)).unscheduledActual].some(x => x.sourceId === laterToday.id));
  assert.ok(plans(await range(future)).some(x => x.id === p.id));
  await api(`/api/calendar/clipboard/undo-move/${moved.undoToken}`, 'POST', {});
  assert.ok((await range(today)).actualBlocks.some(x => x.title === tag));
  pass('future Actual move becomes Plan; move Undo restores Actual');

  const untimed = await actual(past, { title: `${tag} untimed`, startTime: null, endTime: null, durationMinutes: 45 });
  const untimedPlan = await convert(untimed, 'PLAN');
  const untimedActual = await convert(untimedPlan, 'ACTUAL');
  const u = await api(`/api/calendar/actual/LIFE_TIME_ENTRY/${untimedActual.id}`);
  assert.equal(u.durationMinutes, 45); assert.equal(u.startTime, null);
  pass('unscheduled Actual duration survives roundtrip');

  const legacyPlan = await plan(past, { startAt: `${past}T18:00`, endAt: `${past}T18:30` });
  const legacy = await api(`/api/calendar/executions/${legacyPlan.id}/history`, 'POST', { startAt: `${past}T18:00`, endAt: `${past}T18:30` });
  const legacyActual = remember({ kind: 'ACTUAL', id: legacy.sourceId, sourceType: legacy.sourceType });
  r = await range(past);
  assert.ok(!plans(r).some(x => x.id === legacyPlan.id));
  assert.ok(r.actualBlocks.some(x => x.sourceId === legacy.sourceId));
  await convert(legacyActual, 'PLAN');
  pass('legacy linked history projects safely as one block and supports correction');
} finally {
  // Read back only fixture titles to include source IDs replaced by move Undo.
  for (const date of [past, today, future]) {
    const r = await range(date);
    for (const a of [...r.actualBlocks, ...r.unscheduledActual].filter(x => x.title.startsWith(tag))) remember({ kind: 'ACTUAL', id: a.sourceId, sourceType: a.sourceType });
    for (const p of plans(r).filter(x => x.title.startsWith(tag))) remember({ kind: 'PLAN', id: p.id });
  }
  for (const ref of [...refs.values()].sort((a, b) => a.kind === b.kind ? 0 : a.kind === 'ACTUAL' ? -1 : 1)) {
    const path = ref.kind === 'ACTUAL' ? `/api/calendar/actual/${ref.sourceType}/${ref.id}` : `/api/planned-blocks/${ref.id}`;
    const res = await fetch(base + path, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) console.error(`Cleanup failed ${ref.kind} ${ref.id}: ${res.status}`);
  }
  if (category) await api(`/api/life-categories/${category.id}`, 'DELETE');
  console.log('DEV fixture cleanup complete');
}
