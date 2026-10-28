// Execute only with team_kafka_playwright.browser_run_code_unsafe(filename=...).
// Uses the repository's disposable sleep-calendar-owned-runtime, never shared data.
async (page) => {
  const ids = await page.evaluate(() => Array.from({length: 50}, () => crypto.randomUUID()));
  const randomUUID = () => ids.pop();
  const out = 'D:/DEV_Space/sleep-clipboard-artifacts-20261028';
  const web = 'http://127.0.0.1:13242', api = 'http://127.0.0.1:13243/api/sleep/v1';
  const checks = [], errors = [], fixtures = {};
  const check = (value, name) => { if (!value) throw Error(name); checks.push(name); };
  const error = e => errors.push(e.message);
  page.on('pageerror', error);
  const call = async (path, body) => {
    const r = body ? await page.request.post(api + path, { data: body }) : await page.request.get(api + path);
    if (!r.ok()) throw Error(`${path}: ${r.status()} ${await r.text()}`);
    return r.json();
  };
  const action = (type, id, payload, nap = false) => ({ protocolVersion: 2, operationId: randomUUID(), actionType: type,
    [nap ? 'napId' : 'sessionId']: id, expectedRevision: 0, capturedAt: new Date().toISOString(), timezone: 'Asia/Seoul', offsetMinutes: 540,
    deviceId: 'sleep-clipboard-owned-qa', entryPoint: type === 'AUTO_APPLY_SESSION' ? 'BACKGROUND' : 'HISTORY_EDIT', payload });
  const card = id => page.locator(`[data-source-id="${id}"]`);
  const button = name => page.getByRole('button', { name, exact: true });
  const select = async id => {
    await page.bringToFront(); await card(id).waitFor();
    // Focusing a restored window may start the existing focus-refresh. Retry only
    // this read-only selection after that transition; never retry a write here.
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.getByText('불러오는 중…', {exact:true}).waitFor({state:'hidden'});
      await card(id).focus(); await card(id).press('Enter');
      if (await card(id).getAttribute('aria-pressed') === 'true') return;
      await page.waitForTimeout(200);
    }
    throw Error('Selection did not settle: ' + id);
  };
  const copied = () => page.getByLabel('붙여넣을 날짜', { exact: true });
  const target = async (date, time) => { await copied().fill(date); await page.getByLabel('붙여넣을 시각', { exact: true }).fill(time); };
  const pasted = async () => { await page.getByText('1개 붙여넣음 · 새 기록을 선택했습니다.', { exact: true }).waitFor(); return page.locator('.life-event[aria-pressed="true"]').getAttribute('data-source-id'); };
  try {
    fixtures.nightId = randomUUID(); fixtures.napId = randomUUID();
    fixtures.night = (await call('/actions', action('AUTO_APPLY_SESSION', fixtures.nightId, { fields: { bedtimeIntentAt: '2026-09-06T14:30:00Z', wakeAt: '2026-09-06T21:30:00Z' }, fieldTimezones: { bedtimeIntentAt: 'Asia/Seoul', wakeAt: 'Asia/Seoul' } }))).session;
    fixtures.nap = (await call('/naps/actions', action('CREATE_NAP', fixtures.napId, { startAt: '2026-09-07T04:00:00Z', endAt: '2026-09-07T04:30:00Z', startTimezone: 'Asia/Seoul', endTimezone: 'Asia/Seoul', startOffsetMinutes: 540, endOffsetMinutes: 540 }, true))).nap;
    fixtures.night = await call('/sessions/' + fixtures.nightId);
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(web + '/life/sleep?date=2026-09-09&view=week'); await select(fixtures.nightId);
    await button('복사').click(); await target('2026-09-09', '23:30');
    check(await page.locator('.life-paste-target').count() === 1, 'target marker on next wake-date column');
    await button('붙여넣기').click(); const cloneId = await pasted(); fixtures.cloneId = cloneId;
    let clone = await call('/sessions/' + cloneId);
    check(cloneId !== fixtures.nightId && clone.intervalMinutes === 420 && clone.bedtimeIntentAt === '2026-09-09T14:30:00Z' && clone.wakeAt === '2026-09-09T21:30:00Z', 'night new identity and exact overnight duration');
    check(clone.bedtimeSource === 'USER_MANUAL' && clone.wakeSource === 'USER_MANUAL', 'automatic evidence becomes new manual record');
    check(JSON.stringify(await call('/sessions/' + fixtures.nightId)) === JSON.stringify(fixtures.night), 'source unchanged after paste');
    check(await page.getByText('주수면을 수정했습니다.', { exact: false }).count() === 0, 'creation has no misleading edit undo');
    await page.screenshot({ path: out + '/final-night-light.png', fullPage: true });
    await page.reload(); await select(cloneId); check(await card(cloneId).count() === 1, 'reload persistence');
    const note = page.getByLabel('수면 한 줄 메모', { exact: true }); await note.fill('복사본만 편집');
    await note.focus(); await note.press('Control+a'); await note.press('Control+c'); await note.press('Control+v');
    check(await page.getByRole('heading', { name: '응답 확인이 필요한 저장 요청' }).count() === 0, 'editor copy and paste do not trigger calendar persistence');
    await note.fill('복사본만 편집'); await button('저장').click(); await page.getByText('서버에 저장했습니다.', { exact: true }).waitFor();
    check((await call('/sessions/' + cloneId)).sleepNote === '복사본만 편집', 'independent clone editing');
    await card(cloneId).focus(); await card(cloneId).press('Shift+ArrowDown'); await button('저장').click(); await page.getByText('서버에 저장했습니다.', { exact: true }).waitFor();
    clone = await call('/sessions/' + cloneId); check(clone.bedtimeIntentAt === '2026-09-09T14:35:00Z' && clone.intervalMinutes === 420, 'existing post-paste move and save');
    await select(fixtures.napId); await card(fixtures.napId).press('Control+c'); await button('다음 주').click(); await target('2026-09-15', '14:15');
    await button('붙여넣기').click(); const napId = await pasted(); fixtures.napCloneId = napId;
    const nap = await call('/naps/' + napId); check(napId !== fixtures.napId && nap.intervalMinutes === 30 && nap.startAt === '2026-09-15T05:15:00Z', 'nap type duration and cross-week paste');
    await page.reload(); await card(napId).waitFor(); await button('이전 주').click(); await card(fixtures.napId).waitFor(); check(true, 'source and clone persist in respective weeks');
    await select(fixtures.nightId); await button('복사').click(); await target('2026-09-06', '23:30'); await button('붙여넣기').click();
    await page.getByText('오류: SESSION_OVERLAP', { exact: true }).waitFor(); check(await button('변경 취소').isVisible(), 'existing overlap rejection retains editable draft'); await button('변경 취소').click();
    let lostRequest, lostReceipt, retries = [];
    const observe = req => { if (req.url() === api + '/actions' && req.method() === 'POST') retries.push(req.postDataJSON()); };
    page.on('request', observe);
    await page.route(api + '/actions', async route => { const response = await route.fetch(); lostRequest = route.request().postDataJSON(); lostReceipt = await response.json(); await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA response loss after commit' }) }); }, { times: 1 });
    await target('2026-09-11', '23:30');
    // Two synchronous clicks exercise the existing saving ref before React rerenders.
    await button('붙여넣기').evaluate(e => { e.click(); e.click(); });
    await page.getByRole('heading', { name: '응답 확인이 필요한 저장 요청' }).waitFor(); check(retries.length === 1, 'double-dispatched command sends once');
    await button('정확한 요청 재시도').click(); const retryId = await pasted(); fixtures.retryId = retryId; page.off('request', observe);
    check(retryId === lostRequest.sessionId && retryId === lostReceipt.sessionId && (await call('/sessions/' + retryId)).revision === 1, 'response loss retry returns same record without revision churn');
    check(retries.length === 2 && JSON.stringify(retries[0]) === JSON.stringify(retries[1]), 'retry preserves exact operation and payload');
    // Pointer hit testing at 23:30 in the next day's 18–18 display column.
    const column = page.locator('.life-time-column[data-day="2026-09-11"]'); await column.scrollIntoViewIfNeeded(); const box = await column.boundingBox();
    await page.mouse.click(box.x + box.width * .85, box.y + 5.5 * 26);
    check(await copied().inputValue() === '2026-09-10' && await page.getByLabel('붙여넣을 시각', { exact: true }).inputValue() === '23:30', 'pointer click resolves prior evening actual date');
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no body overflow ${width}/${scheme}`);
        const colors = await page.locator('.sleep-clipboard').evaluate(e => ({ background: getComputedStyle(e).backgroundColor, foreground: getComputedStyle(e).color }));
        check(colors.background !== colors.foreground, `clipboard theme ${width}/${scheme}`);
        await page.screenshot({ path: `${out}/final-${scheme}-${width}.png`, fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); await button('일별').click(); await page.locator('.life-time-column').waitFor(); check(await page.locator('.life-time-column').count() === 1, 'daily view retained');
    await button('월간').click(); check(await page.locator('.life-month-cell').count() === 42, 'monthly view retained');
    await button('주간').click(); await select(retryId); await button('삭제').click(); await button('삭제 확인').click(); await page.getByText('기록을 삭제했습니다.', { exact: true }).waitFor();
    check((await page.request.get(api + '/sessions/' + retryId)).status() === 404, 'delete affects pasted record');
    check(JSON.stringify(await call('/sessions/' + fixtures.nightId)) === JSON.stringify(fixtures.night), 'source and automatic provenance remain unchanged after all edits and deletion');
    check(errors.length === 0, 'no uncaught browser errors (409 and injected 503 are expected HTTP errors)');
    const result = { status: 'PASS', scope: 'OWNED_LOOPBACK_SYNTHETIC_ONLY', checks, fixtures, browserErrors: errors, cleanup: 'runtime owns and removes disposable cluster' };
    return result;
  } finally { page.off('pageerror', error); }
}
