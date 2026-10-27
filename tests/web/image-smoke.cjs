'use strict';
// Run inside the built image with --network none, read-only root and no secrets.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {setTimeout:delay}=require('node:timers/promises');
const role=process.argv[2];
async function main(){
 assert.equal(process.getuid(),1000,'image must run as unprivileged node user');
 assert.equal(process.versions.node.split('.')[0],'22');
 // Resolve actual packaged dependencies, not the developer checkout.
 for(const name of ['express','pg','ioredis'])require('/app/node_modules/'+name);
 assert.equal(typeof require('/app/deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client').TraylinxAuthClient,'function');
 if(role==='mcp'){
  const {Client}=require('/app/deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
  const {StdioClientTransport}=require('/app/deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js');
  const transport=new StdioClientTransport({command:'node',args:['scripts/web-agent-mcp.js'],cwd:'/app',stderr:'pipe',env:{PATH:process.env.PATH,
   TRAYLINX_AGENT_USER_ID:'11111111-1111-4111-8111-111111111111',TRAYLINX_CLIENT_ID:'synthetic-client',TRAYLINX_CLIENT_SECRET:'synthetic-secret',
   TRAYLINX_API_BASE_URL:'https://auth.example.test/api',TRAYLINX_WEB_READ_URL:'https://read.example.test',TRAYLINX_ORGANIZATION_ID:'org-a',TRAYLINX_PROJECT_ID:'project-a'}});
  const client=new Client({name:'packaging-smoke',version:'1.0.0'});
  try{await client.connect(transport);const {tools}=await client.listTools();assert(tools.length>0);assert(!tools.some(t=>/approve|confirm/i.test(t.name)));}
  finally{await client.close();}
 }else{
  assert(['read','control'].includes(role));
  const port=role==='read'?8081:8082;
  const child=spawn('node',['scripts/web-'+role+'-server.js'],{cwd:'/app',stdio:['ignore','pipe','pipe']});
  const exited=once(child,'exit');
  try{
   let live;
   for(let i=0;i<40;i++){try{live=await fetch(`http://127.0.0.1:${port}/health/live`);if(live.status===200)break;}catch{}await delay(100);}
   assert.equal(live?.status,200,'real entrypoint did not start');
   assert.equal((await fetch(`http://127.0.0.1:${port}/health/ready`)).status,503);
   assert.equal((await fetch(`http://127.0.0.1:${port}/web/v1/runs`)).status,503);
   child.kill('SIGTERM');
   const exit=await Promise.race([exited,delay(5000).then(()=>{throw Error('shutdown deadline');})]);
   assert.equal(exit[0],0,'graceful shutdown failed');
  }finally{if(child.exitCode===null)child.kill('SIGKILL');}
 }
 console.log(`PACKAGED_${role.toUpperCase()}_PASS`);
}
const deadline=setTimeout(()=>{console.error('package smoke deadline');process.exit(1);},15000);deadline.unref();
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>clearTimeout(deadline));
