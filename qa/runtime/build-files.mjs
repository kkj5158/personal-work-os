import { readFile, writeFile } from 'node:fs/promises';
import { Gate } from './core.mjs';

export async function restoreTsconfig(file, original, distName) {
  const current = await readFile(file, 'utf8');
  if (current === original) return;
  const parsed = JSON.parse(current);
  parsed.include = parsed.include?.filter(entry => entry !== `${distName}/types/**/*.ts` && entry !== `${distName}/dev/types/**/*.ts`);
  if (JSON.stringify(parsed) !== JSON.stringify(JSON.parse(original))) throw new Gate('FAIL_RUNTIME', 'TSCONFIG_CHANGED_EXTERNALLY:preserved for review');
  await writeFile(file, original);
}
