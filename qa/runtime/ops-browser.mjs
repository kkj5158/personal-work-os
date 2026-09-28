// CLI for the canonical authenticated operations browser (Chrome - TEAM KAFKA). See qa/README.md.
//   npm run qa:ops-browser -- --check                       profile/executable/process status, no launch
//   npm run qa:ops-browser -- --open <url> [--hold <sec>] [--headless] [--allow-other-chrome]
// Prints only paths, process counts, the opened URL path and the page title. Never cookies, tokens or storage.
import { launchTeamKafkaBrowser, listChromeProcesses, profileState, resolveChrome, resolveProfile, OpsBrowserError } from '../helpers/team-kafka-browser.mjs';

const args = process.argv.slice(2), flag = name => args.includes(name), value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
try {
  const profileDir = resolveProfile(), executablePath = resolveChrome(), state = profileState(profileDir, listChromeProcesses());
  console.log(JSON.stringify({ profileDir, executablePath, teamKafkaRunning: state.inUse, otherChromeBrowsers: state.otherChrome, staleLock: state.staleLock }));
  if (flag('--open')) {
    const url = value('--open'), hold = Number(value('--hold') ?? 0);
    if (!url || !/^https?:\/\//.test(url)) throw new OpsBrowserError('USAGE', '--open requires an http(s) URL');
    const browser = await launchTeamKafkaBrowser({ headless: flag('--headless'), allowOtherChrome: flag('--allow-other-chrome') });
    const stop = () => { void browser.close().then(() => process.exit(130)); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      let externallyClosed = false; browser.context.on('close', () => { externallyClosed = true; });
      const page = browser.context.pages()[0] ?? await browser.context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      console.log(JSON.stringify({ opened: new URL(page.url()).origin + new URL(page.url()).pathname, title: await page.title() }));
      for (let s = 0; s < hold && !externallyClosed; s++) await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(JSON.stringify({ held: hold, externallyClosed }));
      if (externallyClosed) process.exitCode = 2;
    } finally { await browser.close(); }
  }
} catch (error) {
  console.error(error instanceof OpsBrowserError ? error.message : `OPS_BROWSER_FAILED: ${error.message.split('\n')[0]}`);
  process.exitCode = 1;
}
