// Execute this function through the approved team_kafka_playwright browser_run_code_unsafe.
// Supply page.sleepQaConfig={webOrigin,date,napId,sleepId,workoutIds,calendarId} first.
// Fixtures must already exist in the original DEV domain APIs. This runner never seeds data,
// extracts authentication, changes browser contexts/profiles, or writes domain records.
async (page) => {
  const c = page.sleepQaConfig;
  if (!c || c.webOrigin !== 'https://workflow-web-development-development.up.railway.app') throw Error('Explicit authorized DEV configuration required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !c.workoutIds?.length || !c.calendarId || !c.sleepId || !c.napId) throw Error('Registered canonical fixture IDs required');
  const result = { checks: [], captures: [], domainWrites: 0 };
  const check = (condition, name, facts = {}) => {
    result.checks.push({ name, pass: !!condition, ...facts });
    if (!condition) throw Error('Acceptance failed: ' + name);
  };
  const requests = req => {
    if (new URL(req.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) result.domainWrites++;
  };
  const ready = async selector => page.waitForFunction(s => !!document.querySelector(s), selector, { polling: 100, timeout: 15000 });
  const press = async locator => { await locator.focus(); await locator.press('Enter'); };
  page.on('request', requests);
  try {
    for (const route of ['/life/sleep', '/life/calendar']) {
      await page.goto(c.webOrigin + route + '?date=' + c.date + '&view=week');
      await ready('.life-event[data-source-id="' + (route.endsWith('calendar') ? c.workoutIds[0] : c.sleepId) + '"]');
      check(await page.getByRole('button', { name: '주간', exact: true }).getAttribute('aria-pressed') === 'true', route + ': weekly default');
      check(await page.getByRole('button', { name: '로그아웃', exact: true }).count() === 1, route + ': authenticated shell');
      for (const [mode, count] of [['일별', 1], ['월간', 42], ['주간', 7]]) {
        await press(page.getByRole('button', { name: mode, exact: true }));
        const selector = mode === '월간' ? '.life-month-cell' : '.life-time-column';
        await page.waitForFunction(({ selector, count }) => document.querySelectorAll(selector).length === count, { selector, count }, { polling: 100, timeout: 15000 });
        check(await page.locator(selector).count() === count, route + ': ' + mode);
      }
      for (const scheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const width of [1600, 1366, 1024, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          const facts = await page.locator('.life-time-scroll').evaluate(e => {
            e.scrollLeft = e.scrollWidth;
            const axis = e.querySelector('.life-time-axis').getBoundingClientRect();
            return { body: document.documentElement.scrollWidth, viewport: innerWidth, axisLeft: axis.left, scrollLeft: e.getBoundingClientRect().left };
          });
          check(facts.body <= width, route + ': no body overflow ' + width + '/' + scheme, facts);
          check(Math.abs(facts.axisLeft - facts.scrollLeft) <= 2, route + ': clock stays visible ' + width + '/' + scheme, facts);
          const file = '.qa/resume-20261015/final-' + (route.endsWith('calendar') ? 'integrated' : 'sleep') + '-' + width + '-' + scheme + '.png';
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: file, scale: 'css', timeout: 5000 });
          result.captures.push({ file, width, height: 1000, scheme });
        }
      }
      if (route.endsWith('calendar')) {
        const cards = await page.locator('.life-event.workout').evaluateAll(es => es.map(e => ({ id: e.dataset.sourceId, height: e.getBoundingClientRect().height, clipped: e.scrollHeight > e.clientHeight })));
        check(c.workoutIds.every(id => cards.some(e => e.id === id && e.height >= 96 && !e.clipped)), 'canonical workouts remain readable at mobile width', { cards });
        const sys = page.locator('.life-event.calendar[data-source-id="' + c.calendarId + '"]');
        check(await sys.count() === 1, 'persisted Calendar SYS source ID displayed');
        check((await sys.boundingBox()).height >= 24 && (await sys.boundingBox()).height <= 35, 'Calendar SYS compact card');
        check(await sys.locator('.life-resize').count() === 0, 'Calendar SYS has no resize handles');
        await press(sys);
        await ready('.life-readonly');
        check(await page.locator('.sleep-editor .sleep-primary').count() === 0, 'Calendar SYS has no save command');
        const filter = page.getByLabel('Calendar SYS', { exact: true });
        await filter.focus(); await filter.press('Space');
        await page.waitForFunction(() => !document.querySelector('.life-event.calendar'), null, { polling: 100, timeout: 5000 });
        check(await page.locator('.life-event.calendar').count() === 0, 'Calendar SYS visibility filter');
        await filter.focus(); await filter.press('Space');
      }
    }
    check(result.domainWrites === 0, 'read-only acceptance generated no domain writes');
    return result;
  } finally {
    page.off('request', requests);
  }
}
