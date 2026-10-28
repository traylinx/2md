'use strict';
// Test-only MCP entrypoint for real clients. Public owned fixture; no production
// identity/configuration, no credentials. Actual candidate worker behind stdio.
const {spawn}=require('node:child_process'),readline=require('node:readline'),path=require('node:path');
const {createAgentMcpServer}=require('../../lib/web/mcpServer');
const {createBrowserMcpAgent}=require('../../lib/browser/mcpAgent');
const {StdioServerTransport}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js');
const c=require('../../lib/browser/contracts');
async function main(){
 const image=process.argv[2];if(!/^sha256:[a-f0-9]{64}$/.test(image||''))throw Error('Exact image required');
 const fixture=process.argv[3]==='--private'?'privateWorker.integration.cjs':'dynamicJourney.integration.cjs';
 const child=spawn('python3',[path.join(__dirname,'runCandidatePrivate.py'),image,fixture,'--rpc'],{env:{PATH:process.env.PATH,HOME:process.env.HOME},stdio:['pipe','pipe','pipe']});
 child.stderr.on('data',()=>{});const pending=new Map();let serial=0,server;
 let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 readline.createInterface({input:child.stdout}).on('line',line=>{
  try{const response=JSON.parse(line);if(response.ready)return readyResolve();const entry=pending.get(response.id);if(!entry)return;pending.delete(response.id);clearTimeout(entry.timer);response.error?entry.reject(new c.BrowserError(response.error)):entry.resolve(response.result);}catch{readyReject(Error('Invalid fixture response'));}
 });
 child.once('exit',()=>{readyReject(Error('Fixture stopped'));for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new c.BrowserError('SESSION_LOST'));}pending.clear();void server?.close();});
 const startup=setTimeout(()=>readyReject(Error('Fixture startup deadline')),20000);
 try{
  await ready;clearTimeout(startup);
  const backend={call(name,args){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(new c.BrowserError('UNAVAILABLE'));},40000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,name,arguments:args})+'\n');});}};
  server=createAgentMcpServer({backend:{plan:async()=>c.deny('UNSUPPORTED'),read:async()=>c.deny('UNSUPPORTED')},browserAgent:createBrowserMcpAgent({backend})});
  server.onclose=()=>child.stdin.end();
  await server.connect(new StdioServerTransport());
  process.once('SIGTERM',()=>{child.stdin.end();void server.close();});process.once('SIGINT',()=>{child.stdin.end();void server.close();});
 }catch(e){clearTimeout(startup);child.stdin.end();throw e;}
}
main().catch(()=>{process.stderr.write('Owned candidate fixture unavailable\n');process.exitCode=1;});
