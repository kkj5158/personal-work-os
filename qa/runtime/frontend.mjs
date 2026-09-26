import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { save } from './core.mjs';

// Loaded by Playwright webServer; foreground Next CLI, no separate launcher or daemon.
if (!process.env.QA_RUN_ID || !process.env.QA_TARGET || !process.env.QA_PARENT_PID) throw new Error('Managed QA owner required');
await save(path.join(process.env.QA_RUN_DIR, 'frontend-owner.json'), {
  runId: process.env.QA_RUN_ID, pid: process.pid, parentPid: process.ppid,
  target: process.env.QA_TARGET, apiURL: process.env.QA_API_URL, port: Number(process.env.QA_FRONTEND_PORT)
});
const frontend = path.join(process.env.QA_TARGET, 'frontend');
process.chdir(frontend);
process.argv = [process.execPath, path.join(frontend, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', process.env.QA_FRONTEND_PORT];
await import(pathToFileURL(process.argv[1]));
