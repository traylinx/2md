'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {generateKeyPairSync,randomBytes}=require('node:crypto');const {spawn}=require('node:child_process');
const {createProductionRead}=require('../../lib/web/production');
function environment(file){return {WEB_READ_ENABLED:'1',WEB_READ_ORIGINS:'https://app.example',WEB_READ_RESULT_KEY:randomBytes(32).toString('base64'),
 WEB_READ_CONFIRM_PUBLIC_KEY_FILE:file,WEB_READ_POSTGRES_URL:'postgresql://db.example/read',WEB_READ_REDIS_URL:'redis://cache.example',
 WEB_READ_PROJECT_ACCESS_URL:'https://workspace.example/access',WEB_READ_OWNER_ACCESS_URL:'https://workspace.example/owner',WEB_READ_SEARCH_URL:'https://search.example/read',
 WEB_READ_SENTINEL_URL:'https://auth.example/api',WEB_READ_SENTINEL_CLIENT_ID:'synthetic',WEB_READ_SENTINEL_CLIENT_SECRET:'synthetic',
 WEB_READ_AGENT_ID:'read',WEB_READ_SEARCH_AGENT_ID:'search',WEB_READ_CONFIRM_ISSUER:'control',WEB_READ_CONFIRM_KEY_ID:'v1',WEB_READ_POLICY_VERSION:'v1',WEB_READ_WORKER_ID:'worker-1'};}
test('enabled composition wires real authority factories and bounded SDK; stop closes verifier once',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'web-config-'));const file=path.join(dir,'public.pem');
 fs.writeFileSync(file,generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}));
 try{
 let config,sdkOptions,closed=0;const verify=async()=>{};verify.close=()=>closed++;
 class Sdk{constructor(...args){sdkOptions=args[4];}}
 const service=createProductionRead(environment(file),{loadSdk:()=>({TraylinxAuthClient:Sdk}),verifierFactory:()=>verify,
 clientsFactory:()=>({pool:{},redis:{},close:async()=>{}}),processFactory:value=>{config=value;return {start:async()=>{},stop:async()=>{},status:()=>({})};}});
 assert.equal(config.enabled,true);assert.equal(config.dependencies.authorizeConfirmation,undefined);
 assert.equal(config.dependencies.confirmationAuthority.issuer,'control');assert.equal(typeof config.dependencies.resolvePrincipal,'function');
 assert.deepEqual(sdkOptions,{timeout:3000,maxRetries:0});await service.stop();await service.stop();assert.equal(closed,1);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('disabled composition never loads dependencies; incomplete enabled config fails closed',()=>{
 const bad=()=>{throw Error('must not run');};const service=createProductionRead({}, {loadSdk:bad,clientsFactory:bad,verifierFactory:bad,processFactory:c=>c});assert.equal(service.enabled,false);
 assert.throws(()=>createProductionRead({WEB_READ_ENABLED:'1'}),/^WebBoundaryError: UNAVAILABLE$/);
 assert.throws(()=>createProductionRead({WEB_READ_ENABLED:'true'}),/UNAVAILABLE/);
});
test('executable refuses incomplete activation without leaking configuration',async()=>{
 const child=spawn(process.execPath,['scripts/web-read-server.js'],{cwd:path.resolve(__dirname,'../..'),env:{PATH:process.env.PATH,WEB_READ_ENABLED:'1',WEB_READ_SENTINEL_CLIENT_SECRET:'never-print-this'},stdio:['ignore','pipe','pipe']});
 let text='';child.stdout.on('data',d=>text+=d);child.stderr.on('data',d=>text+=d);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 assert.equal(code,1);assert.equal(text,'web-read: startup unavailable\n');
});
