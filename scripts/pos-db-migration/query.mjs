import {query} from './db.mjs';
import fs from 'node:fs/promises';
const [scope,target,file]=process.argv.slice(2);console.log(JSON.stringify(await query(scope,target,await fs.readFile(file,'utf8'))));
