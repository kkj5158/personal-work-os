import path from 'node:path';
import { redact, save } from '../runtime/core.mjs';

export default class QaReporter {
  tests = []; errors = [];
  onTestEnd(test, result) {
    this.tests.push({ title: test.title, status: result.status, durationMs: result.duration,
      errors: result.errors.map(e => redact(e.message ?? 'unknown browser error')),
      attachments: result.attachments.filter(a => a.path).map(a => ({ name: a.name, path: a.path })) });
  }
  onError(error) { this.errors.push(redact(error.message)); }
  async onEnd(result) {
    await save(path.join(process.env.QA_RUN_DIR, 'browser.json'), { status: result.status, tests: this.tests, errors: this.errors });
  }
}
