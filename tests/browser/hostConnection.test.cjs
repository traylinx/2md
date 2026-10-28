'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {loadHostConnection}=require('../../lib/browser/hostConnection');
const {bound,privateKey}=require('./support.cjs');
test('host connection refuses public modes, symlinks and foreign signing key binding',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-connection-'));const file=path.join(dir,'host.json');
 const data={url:'https://browser.example.org/api/browser/v1',bound,grantId:'grant1',privateKey:privateKey.export({format:'pem',type:'pkcs8'})};
 try{
 fs.writeFileSync(file,JSON.stringify(data),{mode:0o600});assert.equal(loadHostConnection(file).privateKey.asymmetricKeyType,'ed25519');
 fs.chmodSync(file,0o644);assert.throws(()=>loadHostConnection(file),{code:'UNAVAILABLE'});fs.chmodSync(file,0o600);
 fs.symlinkSync(file,path.join(dir,'link'));assert.throws(()=>loadHostConnection(path.join(dir,'link')),{code:'UNAVAILABLE'});
 fs.writeFileSync(file,JSON.stringify({...data,bound:{...bound,hostKeyFingerprint:'0'.repeat(64)}}));assert.throws(()=>loadHostConnection(file),{code:'UNAVAILABLE'});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual stdio executable advertises generic browser tools only with protected host configuration',async()=>{
 const {Client}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js');
 const {StdioClientTransport}=require('../../deploy/web-agent/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gb01-stdio-')),file=path.join(dir,'host.json');
 fs.writeFileSync(file,JSON.stringify({url:'https://browser.example.org/api/browser/v1',bound,grantId:'grant1',privateKey:privateKey.export({format:'pem',type:'pkcs8'})}),{mode:0o600});
 const transport=new StdioClientTransport({command:process.execPath,args:[path.resolve(__dirname,'../../scripts/web-agent-mcp.js')],stderr:'pipe',env:{TRAYLINX_BROWSER_CONNECTION_FILE:file,TRAYLINX_CLIENT_ID:'synthetic',TRAYLINX_CLIENT_SECRET:'synthetic-secret',TRAYLINX_API_BASE_URL:'https://auth.example/api',TRAYLINX_AGENT_USER_ID:'11111111-1111-4111-8111-111111111111',TRAYLINX_WEB_READ_URL:'https://read.example/web/v1',TRAYLINX_ORGANIZATION_ID:'org-1',TRAYLINX_PROJECT_ID:'project-1'}});
 const client=new Client({name:'neutral-stdio-browser-fixture',version:'1'});
 try{await client.connect(transport);const names=(await client.listTools()).tools.map(t=>t.name);assert.equal(names.length,18);assert.ok(names.includes('browser_authenticate'));assert.ok(names.includes('propose_read'));}finally{await client.close();fs.rmSync(dir,{recursive:true,force:true});}
});
