// Ephemeral Inspector runner: no token in OS arguments, files, or QA output.
// Supply the freshly authorized MCP token only in this child process environment.
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const token=process.env.ORBIT_QA_MCP_TOKEN,url=process.env.ORBIT_QA_MCP_URL,tool=process.env.ORBIT_QA_TOOL;
delete process.env.ORBIT_QA_MCP_TOKEN;
if(!token||!url||tool&&!/^get_[a-z_]+_context$/.test(tool))throw Error('Inspector QA input unavailable');
const directory=mkdtempSync(path.join(tmpdir(),'orbit-inspector-')),config=path.join(directory,'config.json');
writeFileSync(config,JSON.stringify({mcpServers:{orbit:{url,type:'streamable-http'}}}));
const entry=path.join(root,'integrations/orbit-mcp/node_modules/@modelcontextprotocol/inspector/clients/cli/build/index.js');
process.argv=[process.execPath,entry,'--config',config,'--server','orbit','--method',tool?'tools/call':'tools/list','--header','Authorization: Bearer '+token,'--format','json'];
if(tool)process.argv.push('--tool-name',tool);
const output=process.stdout.write.bind(process.stdout);let captured='',errors='';let importError;
process.stdout.write=(value,...args)=>{captured+=String(value);const callback=args.find(x=>typeof x==='function');if(callback)callback();return true;};
process.stderr.write=(value,...args)=>{errors+=String(value);const callback=args.find(x=>typeof x==='function');if(callback)callback();return true;};
process.once('exit',code=>{
 let data;try{data=JSON.parse(captured);}catch{}
 const result=data?.result??data;
 output(JSON.stringify({status:code===0&&data?'PASS':'FAIL',inspector:'2.15.0',method:tool?'tools/call':'tools/list',toolCount:Array.isArray(result?.tools)?result.tools.length:null,toolResponseJson:tool?result?.isError!==true&&Array.isArray(result?.content)&&result.content.some(c=>{try{return c.type==='text'&&Boolean(JSON.parse(c.text));}catch{return false;}}):undefined,exitCode:code,importError,diagnostic:code?{config:/config|schema/i.test(errors),unauthorized:/401|unauthoriz/i.test(errors),option:/unknown option|argument/i.test(errors),network:/fetch failed|connect|ENOTFOUND/i.test(errors)}:undefined})+'\n');
 try{unlinkSync(config);rmdirSync(directory);}catch{}
});
try{await import(pathToFileURL(entry).href);}catch(e){importError=e.code||e.name;process.exitCode=1;}
