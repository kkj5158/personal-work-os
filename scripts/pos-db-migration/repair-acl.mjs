import {query,run,save,dir} from './db.mjs';import fs from 'node:fs/promises';import path from 'node:path';
const [scope,database,label]=process.argv.slice(2);process.env.POS_DESTINATION_DATABASE=database;
const report=JSON.parse(await fs.readFile(path.join(dir,scope.toLowerCase()+'-'+label+'-schema-validation.json'),'utf8'));
if(report.missing.length||report.extra.length)throw Error('Object presence mismatch cannot be repaired as ACL');
const ident=s=>'"'+s.replaceAll('"','""')+'"';const privileges={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER',m:'MAINTAIN',X:'EXECUTE',U:'USAGE',C:'CREATE'};
const commands=['BEGIN;'];const repaired=[];
for(const item of report.changed){const source=item.source,destination=item.destination;
 const other=Object.keys(source).filter(k=>!['owner','acl'].includes(k)&&JSON.stringify(source[k])!==JSON.stringify(destination[k]));if(other.length)throw Error('Non-ACL schema mismatch: '+item.key+' '+other.join(','));
 let kind,object;if(source.kind==='schema'){kind='SCHEMA';object=ident(source.name);}else if(source.kind==='relation'){kind=source.type==='S'?'SEQUENCE':source.type==='v'?'TABLE':'TABLE';object=ident(source.schema)+'.'+ident(source.name);}else if(source.kind==='function'){kind='FUNCTION';if(/[;]|--/.test(source.identity))throw Error('Unsupported function identity');object=ident(source.schema)+'.'+ident(source.name)+'('+source.identity+')';}else throw Error('Unsupported ACL object '+item.key);
 if(source.owner!==destination.owner)commands.push(`ALTER ${kind} ${object} OWNER TO ${ident(source.owner)};`);
 const parse=raw=>{const m=raw.match(/^([^=]*)=([^/]+)\/(.+)$/);if(!m)throw Error('Unexpected ACL text');return {role:m[1],bits:m[2],grantor:m[3]};};
 const grants=source.acl.map(parse),old=destination.acl.map(parse);commands.push('SET LOCAL ROLE '+ident(source.owner)+';');
 const roles=[...new Set([...grants,...old].map(x=>x.role))];for(const role of roles)commands.push(`REVOKE ALL ON ${kind} ${object} FROM ${role?ident(role):'PUBLIC'};`);
 for(const grant of grants){if(grant.grantor!==source.owner)throw Error('Unexpected non-owner grantor');for(let i=0;i<grant.bits.length;i++){const p=privileges[grant.bits[i]];if(!p)throw Error('Unknown privilege');const option=grant.bits[i+1]==='*';if(option)i++;commands.push(`GRANT ${p} ON ${kind} ${object} TO ${grant.role?ident(grant.role):'PUBLIC'}${option?' WITH GRANT OPTION':''};`);}}
 commands.push('RESET ROLE;');repaired.push(item.key);
}
commands.push('COMMIT;');await fs.writeFile(path.join(dir,scope.toLowerCase()+'-'+label+'-acl-repair.sql'),commands.join('\n')+'\n');await run(scope,'destination','psql',['-X','-q','-v','ON_ERROR_STOP=1'],commands.join('\n'));await save(scope.toLowerCase()+'-'+label+'-acl-repair.json',{at:new Date().toISOString(),scope,database,repaired,sourceOwnersAndPrivilegesPreserved:true});console.log(JSON.stringify({repaired}));
