import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { Gate, git } from './core.mjs';

export const required = ['DEV_DB_URL', 'DEV_DB_USERNAME', 'DEV_DB_PASSWORD', 'APP_DEV_USER_ID'];
export function systemEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|JAVA_HOME|GRADLE_USER_HOME|LANG|LC_ALL|PLAYWRIGHT_BROWSERS_PATH)$/i.test(key)));
}
export async function loadEnvironment(target, explicit, source = process.env) {
  const values = {};
  const sources = [];
  const loadFile = async file => {
    try {
      const text = await readFile(file, 'utf8');
      if (file.endsWith('.xml')) {
        const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', isArray: tag => ['component', 'configuration', 'env'].includes(tag) }).parse(text);
        const configs = (parsed.project?.component ?? []).flatMap(c => c.configuration ?? []);
        const matches = configs.filter(c => c.name === 'BackendApplication');
        if (matches.length !== 1) throw new Gate('BLOCKED_CONTEXT', 'ENVIRONMENT SOURCE INACCESSIBLE:expected one IntelliJ BackendApplication configuration');
        for (const entry of matches[0].envs?.env ?? []) if (required.includes(entry.name)) values[entry.name] = entry.value;
      } else Object.assign(values, Object.fromEntries(Object.entries(parseEnv(text)).filter(([key]) => required.includes(key))));
      sources.push(path.resolve(file));
    } catch (e) { if (e.code !== 'ENOENT' || explicit) throw e; }
  };
  if (explicit) await loadFile(path.resolve(explicit));
  else {
    const common = path.resolve(target, git(target, 'rev-parse', '--git-common-dir'));
    const primary = path.dirname(common);
    await loadFile(path.join(primary, '.idea', 'workspace.xml'));
    await loadFile(path.join(primary, '.env'));
    if (primary !== target) await loadFile(path.join(target, '.env'));
  }
  for (const key of required) if (source[key]) values[key] = source[key];
  const missing = required.filter(key => !values[key] || /\$\{|^</.test(values[key]));
  if (missing.length) throw new Gate('BLOCKED_CONTEXT', `ENVIRONMENT SOURCE INACCESSIBLE:exported DEV variables/.env/IntelliJ BackendApplication; missing ${missing.join(',')}`);
  if (!values.DEV_DB_URL.startsWith('jdbc:postgresql://')) throw new Gate('BLOCKED_CONTEXT', 'INVALID_DEV_JDBC_URL');
  return { values, sources, facts: Object.fromEntries(required.map(key => [key, 'SET'])) };
}
