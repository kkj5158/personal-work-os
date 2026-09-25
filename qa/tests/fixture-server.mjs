import http from 'node:http';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

if (process.env.FIXTURE_FAIL) { console.error('fixture startup failed'); process.exit(17); }
if (process.env.FIXTURE_CHILD_FILE) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  await writeFile(process.env.FIXTURE_CHILD_FILE, String(child.pid));
}
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<!doctype html><title>QA fixture</title><h1>Ready</h1>');
}).listen(Number(process.env.FIXTURE_PORT), '127.0.0.1');
