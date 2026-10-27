'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {EventEmitter}=require('node:events');const {generateKeyPairSync}=require('node:crypto');
const {createProductionControl}=require('../../lib/web/controlProduction');
test('disabled control loads no SDK/database; invalid enable fails closed',()=>{
 const bad=()=>{throw Error('dependency loaded');};assert.equal(createProductionControl({}, {loadSdk:bad,processFactory:v=>v}).enabled,false);
 assert.throws(()=>createProductionControl({WEB_CONTROL_ENABLED:'yes'}),/UNAVAILABLE/);
});
test('control uses two database connections, no Redis/dispatcher and validates key file mode',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'web-control-'));const file=path.join(dir,'key.pem');
 fs.writeFileSync(file,generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const env={WEB_PILOT_ORGANIZATION_ID:'org',WEB_PILOT_PROJECT_ID:'project',WEB_CAPTURE_ALLOWED_ORIGINS:'https://example.com',WEB_CONTROL_ENABLED:'1',WEB_CONTROL_POSTGRES_URL:'postgresql://db.example/control',WEB_CONTROL_PROJECT_ACCESS_URL:'https://workspace.example/human',WEB_CONTROL_OWNER_ACCESS_URL:'https://workspace.example/background',WEB_CONTROL_SENTINEL_URL:'https://auth.example/api',WEB_CONTROL_AGENT_ID:'control-agent',WEB_CONTROL_SENTINEL_CLIENT_ID:'synthetic',WEB_CONTROL_SENTINEL_CLIENT_SECRET:'synthetic',WEB_CONTROL_CONFIRM_ISSUER:'control',WEB_CONTROL_CONFIRM_KEY_ID:'v1',WEB_CONTROL_POLICY_VERSION:'v1',WEB_CONTROL_SIGNING_KEY_FILE:file};
 let poolConfig,opened=0,ended=0,config;class Pool extends EventEmitter{constructor(v){super();poolConfig=v;}async query(){opened++;}async end(){ended++;}}
 class Sdk{async getAgentRequestHeaders(){throw Error('not called at startup');}}
 try{
 createProductionControl(env,{Pool,loadSdk:()=>({TraylinxAuthClient:Sdk}),processFactory:v=>{config=v;return v;}});
 assert.equal(opened,0);assert.equal(poolConfig.max,2);assert.equal(config.clients.redis,undefined);assert.equal(config.applicationFactory().runtime,undefined);
 await config.clients.open();await config.clients.close();await config.clients.close();assert.equal(opened,1);assert.equal(ended,1);
 fs.chmodSync(file,0o644);assert.throws(()=>createProductionControl(env,{Pool,loadSdk:()=>({TraylinxAuthClient:Sdk})}),/^WebBoundaryError: UNAVAILABLE$/);
 }finally{fs.rmSync(dir,{recursive:true});}
});
