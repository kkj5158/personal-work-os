// Read-only baseline of established MONEY rows; no payloads or credentials in receipts.
import fs from 'node:fs/promises';
import path from 'node:path';
import {vars, query} from '../scripts/pos-db-migration/db.mjs';

const [scope, phase] = process.argv.slice(2);
if (!['DEV', 'PROD'].includes(scope) || !['before', 'after'].includes(phase)) throw Error('Use DEV|PROD before|after');
const dir = 'F:/artifacts/money-calendar-web-v1-20261015';
const config = vars(scope), url = new URL(config[scope + '_DB_URL'].replace(/^jdbc:/, ''));
if (!url.hostname.endsWith('.railway.internal') || url.pathname !== '/pos_' + scope.toLowerCase() + '_final') throw Error('ACTIVE_RAILWAY_ENVIRONMENT_REQUIRED');
process.env.POS_DESTINATION_DATABASE = url.pathname.slice(1);
const file = path.join(dir, scope.toLowerCase() + '-preservation-before.json');
const before = phase === 'after' ? JSON.parse(await fs.readFile(file, 'utf8')) : null;
const cutoff = before?.cutoff ?? new Date().toISOString();
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cutoff)) throw Error('CUTOFF_REQUIRED');
const columns = await query(scope, 'destination', `BEGIN READ ONLY;
SELECT json_build_object('name',table_name,'columns',json_agg(column_name)) FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'money_%' AND table_name NOT LIKE 'money_calendar_%' GROUP BY table_name ORDER BY table_name;
ROLLBACK;`);
const names = before?.rows.map(row => row.table) ?? columns.map(row => row.name);
const checks = names.map(table => {
  if (!/^money_[a-z_]+$/.test(table)) throw Error('TABLE_ALLOWLIST_REQUIRED');
  const entry = columns.find(row => row.name === table);
  if (!entry) throw Error('ESTABLISHED_TABLE_MISSING');
  const clock = entry.columns.includes('created_at') ? 'created_at' : entry.columns.includes('received_at') ? 'received_at' : null;
  return `SELECT json_build_object('table','${table}','count',count(*),'digest',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),''))) FROM public.${table} t ${clock ? `WHERE t.${clock}<='${cutoff}'::timestamptz` : ''};`;
});
const rows = await query(scope, 'destination', `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='60000'; ${checks.join('\n')} ROLLBACK;`);
const result = {scope, phase, database:url.pathname.slice(1), observedAt:new Date().toISOString(), cutoff, readOnly:true, rowPayloadsSaved:false, rows};
if (before) {
  result.changed = rows.filter(row => JSON.stringify(row) !== JSON.stringify(before.rows.find(prior => prior.table === row.table))).map(row => row.table);
  result.establishedRecordsUnchanged = result.changed.length === 0;
}
await fs.writeFile(path.join(dir, scope.toLowerCase() + '-preservation-' + phase + '.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({...result, rows:undefined, tables:rows.length}, null, 2));
