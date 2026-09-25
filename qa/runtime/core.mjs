import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export class Gate extends Error {
  constructor(status, gate) { super(gate); this.status = status; }
}
export const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const json = async file => JSON.parse(await readFile(file, 'utf8'));
export async function save(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n');
}
export function redact(text, secrets = []) {
  let result = String(text);
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) result = result.replaceAll(secret, '[REDACTED]');
  return result.replace(/(?:jdbc:)?postgres(?:ql)?:\/\/[^\s"']+/gi, '[DB_URL]')
    .replace(/(password|authorization|access_token|refresh_token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}
export async function available(port) {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => server.close(() => resolve(true)));
  });
}
export async function choosePort(requested, start, end) {
  const ports = requested === undefined ? Array.from({ length: end - start + 1 }, (_, i) => start + i) : [Number(requested)];
  for (const port of ports) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Gate('BLOCKED_CONTEXT', 'INVALID_PORT');
    if (await available(port)) return port;
  }
  throw new Gate('BLOCKED_RESOURCE', requested ? `PORT_OCCUPIED:${requested}:external runtime preserved` : 'QA_PORT_RANGE_EXHAUSTED');
}
export async function acquireLock(file, owner) {
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(file, JSON.stringify(owner), { flag: 'wx' }); }
  catch (e) { if (e.code === 'EEXIST') throw new Gate('BLOCKED_RESOURCE', 'QA_LOCK_OCCUPIED:inspect owner; no automatic stale lock reclamation'); throw e; }
  return async () => {
    const current = await json(file);
    if (current.runId !== owner.runId || current.pid !== owner.pid) throw new Gate('FAIL_RUNTIME', 'LOCK_OWNERSHIP_CHANGED');
    await unlink(file);
  };
}
export function ownedProcess(command, args, { cwd, env, name, logFile, secrets = [], onStart = () => {} }) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const lines = [];
  let exited = false, exitCode, error, output = '';
  let writes = Promise.resolve();
  const record = line => { const safe = redact(line, secrets); lines.push(safe); if (lines.length > 200) lines.shift(); output += safe + '\n'; };
  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => { pending += chunk; const parts = pending.split(/\r?\n/); pending = parts.pop(); parts.forEach(record); });
    stream.on('end', () => { if (pending) record(pending); });
  }
  const done = new Promise(resolve => {
    child.on('error', e => { error = e; });
    child.on('close', code => {
      exited = true; exitCode = code;
      writes = writeFile(logFile, output); writes.then(() => resolve(code), () => resolve(code));
    });
  });
  onStart({ name, pid: child.pid ?? null, startedAt: new Date().toISOString() });
  return {
    child, done, name, get exited() { return exited; }, get output() { return lines.join('\n'); },
    check() {
      if (error) throw new Gate(error.code === 'EACCES' || error.code === 'EPERM' ? 'BLOCKED_POLICY' : 'FAIL_RUNTIME', `${name}:spawn:${error.code}`);
      if (exited) throw new Gate('FAIL_RUNTIME', `${name}:exited:${exitCode}`);
    },
    async wait(timeoutMs, signal) {
      const deadline = Date.now() + timeoutMs;
      while (!exited) { signal?.throwIfAborted(); if (Date.now() > deadline) throw new Gate('FAIL_RUNTIME', `${name}:timeout`); await delay(100); }
      await done; await writes;
      if (error) this.check();
      if (exitCode !== 0) throw new Gate('FAIL_RUNTIME', `${name}:exit:${exitCode}`);
    },
    async stop() {
      if (!exited && child.pid) {
        // The live ChildProcess handle is the authority. Never kill a PID read from a stale file or a port.
        if (process.platform === 'win32') {
          await new Promise((resolve, reject) => {
            const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
            killer.once('error', reject); killer.once('close', resolve);
          });
        } else child.kill('SIGTERM');
        const stopped = await Promise.race([done.then(() => true), delay(10000, false, { ref: false })]);
        if (!stopped) { child.kill('SIGKILL'); await Promise.race([done, delay(3000, undefined, { ref: false })]); }
      }
      if (!exited) throw new Gate('FAIL_RUNTIME', `${name}:CLEANUP_FAILED`);
      await writes;
      return { name, pid: child.pid ?? null, stopped: true };
    }
  };
}
export async function readiness(url, processOwner, timeoutMs, signal) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    signal?.throwIfAborted(); processOwner.check();
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1500) }); await response.arrayBuffer(); if (response.ok) { processOwner.check(); return; } } catch { /* retry bounded HTTP probe */ }
    await delay(200);
  }
  throw new Gate('FAIL_RUNTIME', `${processOwner.name}:READINESS_TIMEOUT`);
}
export async function writeResult(dir, result) {
  await save(path.join(dir, 'result.json'), result);
  await writeFile(path.join(dir, 'result.md'), `# Central QA ${result.runId}\n\nStatus: **${result.status}**\n\nGate: ${result.gate ?? 'none'}\n\nSystem: ${result.system}\nRevision: ${result.revision ?? 'unresolved'}\nWorktree: ${result.worktree}\n\nPorts: ${JSON.stringify(result.ports)}\nMigration: ${result.migration}\nAPI: ${result.api}\nBrowser: ${result.browser}\nCleanup: ${result.cleanup.status}\n\nSee result.json and redacted logs for evidence. PASS covers only the named scenarios; it is not PROD release authorization.\n`);
}
