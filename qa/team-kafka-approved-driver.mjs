// Official MCP SDK over the existing owner-approved STDIO wrapper; no CDP/custom protocol.
// Private token is loaded only by that wrapper from current-user DPAPI.
import readline from 'node:readline';
import {Client} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {ListRootsRequestSchema} from '../integrations/orbit-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
import {pathToFileURL} from 'node:url';
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|HOMEDRIVE|HOMEPATH)$/i.test(k)));
const transport=new StdioClientTransport({command:'C:/Users/JIUU/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe',args:['-NoProfile','-File','C:/Users/JIUU/.codex/browser/Start-TeamKafkaPlaywrightMcp.ps1'],env,stderr:'pipe'});
const client=new Client({name:'WORK QUEUE approved TEAM KAFKA browser QA',version:'1'},{capabilities:{roots:{listChanged:false}}});
client.setRequestHandler(ListRootsRequestSchema,async()=>({roots:[{uri:pathToFileURL(process.cwd()+'/').href,name:'WORK QUEUE isolated task workspace'}]}));
const redact=value=>String(value).replace(/([?&](?:code|access_token|refresh_token|id_token|token)=)[^&\s"'<>]+/gi,'$1[REDACTED]').replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [REDACTED]');
const allowed=new Set(['browser_navigate','browser_evaluate','browser_run_code','browser_tabs','browser_snapshot','browser_click','browser_press_key','browser_take_screenshot','browser_close']);
await client.connect(transport);transport.stderr?.on('data',chunk=>{const value=redact(chunk);if(value.includes('TEAM_KAFKA_MCP_STARTUP_FAILED'))console.error('APPROVED_BROWSER_STARTUP_FAILED');});
const catalog=await client.listTools();const available=catalog.tools.filter(t=>allowed.has(t.name));console.log(JSON.stringify({status:'APPROVED_SDK_CLIENT_READY',pid:process.pid,transport:'existing sanctioned STDIO wrapper',tools:available.map(t=>({name:t.name,inputSchema:t.inputSchema}))}));
try{
 for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
  let request;try{request=JSON.parse(line);if(request.stop)break;
   if(request.oauthCallbackHandoff){
    const port=Number(request.port);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_HANDOFF_PORT');
    const result=await client.callTool({name:'browser_evaluate',arguments:{function:"() => ({callback: location.origin === 'https://chatgpt.com' && location.pathname === '/connector_platform_oauth_redirect' ? location.href : null})"}});
    const raw=result.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??'';
    const block=raw.match(/### Result\s*\n([\s\S]*?)\n###/);if(result.isError||!block)throw Error('CALLBACK_NOT_AVAILABLE');
    const value=JSON.parse(block[1]);if(!value.callback)throw Error('CALLBACK_NOT_AVAILABLE');
    const response=await fetch('http://127.0.0.1:'+port+'/finish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(45000)});
    console.log(JSON.stringify({id:request.id,status:response.status,result:await response.json()}));continue;
   }
   if(!allowed.has(request.tool)||!available.some(t=>t.name===request.tool))throw Error('UNSUPPORTED_TOOL');const result=await client.callTool({name:request.tool,arguments:request.arguments??{}});const text=result.content?.filter(c=>c.type==='text').map(c=>c.text).join('\n')??'';console.log(redact(JSON.stringify({id:request.id,isError:!!result.isError,text})));}catch(error){console.log(JSON.stringify({id:request?.id,error:/^[A-Z_]+$/.test(error.message)?error.message:'APPROVED_BROWSER_TOOL_FAILED'}));}
 }
}finally{await client.close();}
