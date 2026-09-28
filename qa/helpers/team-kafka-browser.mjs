// Canonical authenticated operations browser (TEAM KAFKA policy): Chrome - TEAM KAFKA =
// Google Chrome stable with --user-data-dir=%LOCALAPPDATA%\Chrome-TEAM-KAFKA. Used only for Railway/PROD and other
// authenticated operations UI; ordinary DEV browser QA keeps the isolated Playwright Chromium.
// Never falls back to the personal/default Chrome profile, never attaches to or stops another Chrome, never reads or
// prints cookies, tokens, passwords or session storage.
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const PROFILE_DIRNAME = 'Chrome-TEAM-KAFKA';
/** Cold Turkey Blocker in the TEAM KAFKA profile. Cold Turkey closes every Chrome window when a Chrome runs without it. */
export const COLD_TURKEY_EXTENSION_ID = 'pganeibhckoanndahmnfggfoeofncnii';
/**
 * Playwright adds --disable-extensions (and disables component extensions) by default. With the TEAM KAFKA profile that
 * starts a Chrome without its Cold Turkey extension, and Cold Turkey then closes all Chrome instances, the personal
 * Chrome included. Keep the profile's own extensions enabled.
 */
export const LAUNCH_IGNORE_DEFAULT_ARGS = ['--disable-extensions', '--disable-component-extensions-with-background-pages'];

export class OpsBrowserError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code; }
}
const normalize = value => path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();

/** %LOCALAPPDATA%\Chrome-TEAM-KAFKA, which must already be a Chrome user-data-dir. Never the personal default dir. */
export function resolveProfile(env = process.env) {
  if (!env.LOCALAPPDATA) throw new OpsBrowserError('TEAM_KAFKA_PROFILE_MISSING', 'LOCALAPPDATA is not set; the TEAM KAFKA profile cannot be resolved.');
  const dir = path.join(env.LOCALAPPDATA, PROFILE_DIRNAME);
  if (normalize(dir) === normalize(path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data'))) throw new OpsBrowserError('PERSONAL_PROFILE_REFUSED', 'The personal/default Chrome profile is never used.');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new OpsBrowserError('TEAM_KAFKA_PROFILE_MISSING', `${dir} does not exist. Create it once with the "Chrome - TEAM KAFKA" shortcut; no other profile is substituted.`);
  if (!existsSync(path.join(dir, 'Local State')) || !existsSync(path.join(dir, 'Default'))) throw new OpsBrowserError('TEAM_KAFKA_PROFILE_INVALID', `${dir} is not a Chrome user-data-dir (Local State/Default missing).`);
  return dir;
}

/** Google Chrome stable only (no Chromium, Beta/Canary or OS default-browser fallback). */
export function resolveChrome(env = process.env) {
  const candidates = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA]
    .filter(Boolean).map(root => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  const found = candidates.find(file => existsSync(file));
  if (!found) throw new OpsBrowserError('CHROME_STABLE_NOT_FOUND', `Google Chrome stable was not found (${candidates.join(', ')}).`);
  return found;
}

/** Browser (non-child) chrome.exe processes: { pid, userDataDir|null }. Only the user-data-dir is extracted from the command line. */
export function parseChromeProcesses(rows) {
  return rows.filter(row => row.CommandLine && !/\s--type=/.test(row.CommandLine)).map(row => {
    const match = /--user-data-dir=(?:"([^"]+)"|(\S+))/.exec(row.CommandLine);
    return { pid: row.ProcessId, userDataDir: match ? (match[1] ?? match[2]) : null };
  });
}
export function listChromeProcesses() {
  const out = execFileSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"], { encoding: 'utf8' }).trim();
  const rows = out ? JSON.parse(out) : [];
  return parseChromeProcesses(Array.isArray(rows) ? rows : [rows]);
}

/** State of the TEAM KAFKA profile relative to running Chrome browser processes. */
export function profileState(profileDir, processes, lockExists = existsSync(path.join(profileDir, 'lockfile'))) {
  const mine = processes.filter(item => item.userDataDir && normalize(item.userDataDir.replace(/%LOCALAPPDATA%/i, process.env.LOCALAPPDATA ?? '')) === normalize(profileDir));
  return { inUse: mine.length > 0, teamKafkaPids: mine.map(item => item.pid), otherChrome: processes.length - mine.length, staleLock: lockExists && mine.length === 0 };
}

/** Launch options: explicit executable + persistent TEAM KAFKA profile, its own extensions kept enabled. */
export function launchOptions({ executablePath, headless = false, viewport = { width: 1600, height: 1000 } }) {
  return { executablePath, headless, viewport, ignoreDefaultArgs: LAUNCH_IGNORE_DEFAULT_ARGS };
}

/**
 * Starts Chrome - TEAM KAFKA through Playwright and verifies it before returning.
 * - refuses when the profile is already open (never attaches to, reuses or stops an existing Chrome);
 * - refuses while any other Chrome runs unless allowOtherChrome is set (see qa/README: Cold Turkey guard);
 * - verifies the real browser command line uses exactly this user-data-dir and that Cold Turkey is active,
 *   otherwise closes within seconds and throws.
 * Always call close(): it ends the browser cleanly (flushing the profile) and waits for the profile lock to clear.
 */
export async function launchTeamKafkaBrowser({ headless = false, allowOtherChrome = false, env = process.env, list = listChromeProcesses, verifyTimeoutMs = 5000 } = {}) {
  const profileDir = resolveProfile(env), executablePath = resolveChrome(env);
  const before = profileState(profileDir, list());
  if (before.inUse) throw new OpsBrowserError('TEAM_KAFKA_PROFILE_IN_USE', `Chrome - TEAM KAFKA is already running (pid ${before.teamKafkaPids.join(', ')}). Close that window first; it is never attached to or stopped by tooling.`);
  if (before.otherChrome > 0 && !allowOtherChrome) throw new OpsBrowserError('OTHER_CHROME_RUNNING', `${before.otherChrome} other Chrome browser process(es) are running. Launch is refused so a failed extension check can never cause Cold Turkey to close them; pass allowOtherChrome only per qa/README.`);
  const { chromium } = await import('@playwright/test');
  const context = await chromium.launchPersistentContext(profileDir, launchOptions({ executablePath, headless }));
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    await context.close().catch(() => {});
    for (let i = 0; i < 40 && existsSync(path.join(profileDir, 'lockfile')); i++) await new Promise(resolve => setTimeout(resolve, 250));
  };
  try {
    const running = profileState(profileDir, list());
    if (!running.inUse) throw new OpsBrowserError('PROFILE_NOT_VERIFIED', 'The launched browser process does not report the TEAM KAFKA user-data-dir.');
    // Only a profile that has Cold Turkey installed needs (and can pass) the Cold Turkey check.
    const guarded = existsSync(path.join(profileDir, 'Default', 'Extensions', COLD_TURKEY_EXTENSION_ID));
    const cdp = await context.browser().newBrowserCDPSession();
    let active = !guarded;
    for (const end = Date.now() + verifyTimeoutMs; !active && Date.now() < end;) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      active = targetInfos.some(target => target.url.startsWith(`chrome-extension://${COLD_TURKEY_EXTENSION_ID}/`));
      if (!active) await new Promise(resolve => setTimeout(resolve, 250));
    }
    await cdp.detach().catch(() => {});
    if (!active) throw new OpsBrowserError('EXTENSIONS_NOT_ACTIVE', 'Cold Turkey is not active in the launched TEAM KAFKA browser; closed immediately.');
    return { context, profileDir, executablePath, close };
  } catch (error) { await close(); throw error; }
}
