'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {Client}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
const {StdioClientTransport}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js');
(async()=>{
 const image=process.argv[2],client=new Client({name:'arbitrary-owned-client',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.join(__dirname,'clientCandidateMcp.cjs'),image],env:{PATH:process.env.PATH,HOME:process.env.HOME},stderr:'pipe'});
 transport.stderr?.on('data',()=>{});
 try{
  await client.connect(transport);assert.match(client.getInstructions(),/client-neutral/);
  const tools=(await client.listTools()).tools;assert.ok(tools.some(t=>t.name==='browser_open'));
  const call=async(name,args={})=>{const reply=await client.callTool({name,arguments:args});assert.equal(reply.isError,false,JSON.stringify(reply));return reply.structuredContent;};
  const capabilities=await call('get_browser_capabilities');assert.equal(capabilities.credentialChannel,'unavailable');assert.ok(!capabilities.available.includes('browser_authenticate'));
  const opened=await call('browser_open',{runtimeEpoch:capabilities.runtimeEpoch,actionId:'open1',mode:'public',url:'https://example.com',purpose:'Read owned plan prices'});assert.equal(opened.state,'succeeded');
  const observed=await call('browser_observe',{sessionId:opened.sessionId});assert.equal(observed.state,'ready');
  const result=await call('browser_extract',{sessionId:opened.sessionId});assert.match(result.markdown,/Sprout[\s\S]*USD 12/);
  await call('browser_close',{sessionId:opened.sessionId});
  console.log('PASS: real stdio MCP -> owned candidate bridge -> actual runtime/worker/Chromium; neutral discovery, unavailable private input, public evidence and close. Not a real agentic-client acceptance.');
 }finally{await client.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
