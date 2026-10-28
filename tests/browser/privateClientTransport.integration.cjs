'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {Client}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const {StdioClientTransport}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js');
(async()=>{
 const image=process.argv[2],client=new Client({name:'arbitrary-owned-client',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.join(__dirname,'clientCandidateMcp.cjs'),image,'--private'],env:{PATH:process.env.PATH,HOME:process.env.HOME},stderr:'pipe'});
 transport.stderr?.on('data',()=>{});
 try{
  await client.connect(transport);assert.match(client.getInstructions(),/client-neutral/);
  const tools=(await client.listTools()).tools;assert.ok(tools.some(t=>t.name==='browser_open'));
  const call=async(name,args={})=>{const reply=await client.callTool({name,arguments:args});assert.equal(reply.isError,false,JSON.stringify(reply));return reply.structuredContent;};
  const capabilities=await call('get_browser_capabilities');assert.ok(capabilities.available.includes('browser_authenticate'));assert.equal(capabilities.ownerConnection,undefined);
  const opened=await call('browser_open',{runtimeEpoch:capabilities.runtimeEpoch,actionId:'open1',mode:'login_read',url:'https://example.com',purpose:'Read owned plan prices'});assert.equal(opened.state,'succeeded');
  const observed=await call('browser_observe',{sessionId:opened.sessionId});assert.equal(observed.state,'access_required');
  const credential=await call('browser_credentials',{sessionId:opened.sessionId,origin:'https://example.com',purpose:'Read owned messages'});assert.equal(credential.state,'ready');
  const ref=name=>observed.controls.find(x=>x.name===name).ref;
  const login=await call('browser_authenticate',{runtimeEpoch:capabilities.runtimeEpoch,sessionId:opened.sessionId,actionId:'login1',observationId:observed.observationId,credentialRef:credential.credentialRef,fields:{usernameRef:ref('Username'),passwordRef:ref('Password')},submitRef:ref('Log in')});assert.equal(login.state,'succeeded',JSON.stringify(login));

  const result=await call('browser_extract',{sessionId:opened.sessionId});assert.match(result.markdown,/Owned organization/);assert.equal(result.source.privacy,'private');assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_WORKER_PASSWORD/);
  await call('browser_close',{sessionId:opened.sessionId});
  console.log('PASS: real stdio MCP -> owned candidate bridge -> actual runtime/worker/Chromium; paired owner, protected HTTP credential form, signed native login, private redacted evidence and close. Not a real agentic-client acceptance.');
 }finally{await client.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
