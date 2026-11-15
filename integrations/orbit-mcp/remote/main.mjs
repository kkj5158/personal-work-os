import {createApp} from './app.mjs';
import {configFromEnv} from './config.mjs';
try{
 const config=configFromEnv();
 const {app,store}=await createApp(config);
 const server=app.listen(config.port,'0.0.0.0',()=>console.log('ORBIT_MCP_READY'));
 const stop=()=>{server.close(()=>{store.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
}catch{console.error('ORBIT_MCP_START_FAILED');process.exitCode=1;}
