import {writeFile} from 'node:fs/promises';
import {moneyDefinitions,moneyTools} from '../integrations/orbit-mcp/money-tools.mjs';
import {tools as legacyTools} from '../integrations/orbit-mcp/server.mjs';
const paths={};
for(const d of moneyDefinitions){const operation={operationId:d.name,description:d.description,security:[{posUserBearer:[],orbitMoneyEntitlement:[]}],responses:{200:{description:'Canonical envelope and persisted command outcome'},400:{description:'VALIDATION'},403:{description:'FORBIDDEN'},409:{description:'CONFLICT / PREVIEW_STALE'},429:{description:'RATE_LIMIT'}}};
 if(d.method==='GET')operation.parameters=Object.entries(d.inputSchema.properties).map(([name,schema])=>({name,in:'query',required:d.inputSchema.required.includes(name),schema}));
 else operation.requestBody={required:true,content:{'application/json':{schema:d.inputSchema}}};
 paths['/api/orbit/money/v1/'+d.route]={[d.method.toLowerCase()]:operation};
}
const contract={openapi:'3.1.0',info:{title:'ORBIT MONEY Console',version:'1.0.0'},paths,components:{securitySchemes:{posUserBearer:{type:'http',scheme:'bearer',bearerFormat:'ES256 JWT'},orbitMoneyEntitlement:{type:'apiKey',in:'header',name:'X-Orbit-Money-Proof',description:'Broker-signed 30-second request-bound entitlement; not a model-supplied scope. Required for delegated tokens.'}}}};
await writeFile('integrations/orbit-mcp/money-openapi.json',JSON.stringify(contract,null,2)+'\n');
await writeFile('docs/contracts/orbit-money-tools-v1.json',JSON.stringify({schemaVersion:'orbit-money-v1',legacyTools:20,newTools:moneyTools.length,preservedTools:legacyTools.map(t=>({...t,route:'/api/orbit/context/'+t.name,method:'GET',requiredScopes:['orbit:read']})),tools:moneyDefinitions},null,2)+'\n');
const rows=moneyDefinitions.map(d=>`| \`${d.name}\` | ${d.method} \`${d.route}\` | ${d.requiredScopes.join(' + ')} | ${d.tier} | ${d.preview?'Preview receipt only':d.method==='GET'?'Read':'Canonical guarded write'} |`).join('\n');
const oldRows=legacyTools.map(t=>`| \`${t.name}\` | GET \`/api/orbit/context/${t.name}\` | orbit:read | READ | Preserved read |`).join('\n');
await writeFile('docs/contracts/orbit-money-tool-inventory-v1.md',`# ORBIT MONEY exact tool inventory\n\nExisting 20 tools in server.mjs are preserved unchanged. ${moneyTools.length} additions; ${20+moneyTools.length} hosted tools total. New routes below are relative to /api/orbit/money/v1/. The JSON inventory contains every exact required/optional field and closed schema, including the preserved tools.\n\n| Tool | Backend route | Required scopes | Tier | Effect |\n|---|---|---|---|---|\n${rows}\n\n## Preserved tools\n\n| Tool | Backend route | Required scopes | Tier | Effect |\n|---|---|---|---|---|\n${oldRows}\n`);
console.log(JSON.stringify({tools:20+moneyTools.length,newTools:moneyTools.length,routes:Object.keys(paths).length}));
