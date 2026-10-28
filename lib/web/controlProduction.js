'use strict';
const {createPilotPolicy}=require('./pilotPolicy');
const fs=require('node:fs');const c=require('./contracts');const {endpoint}=require('./dispatch');
const {createWebProcess}=require('./process');const {createHeadlessApprovalApplication}=require('./headlessApproval');
const {createProjectPrincipalResolver}=require('./projectPrincipal');const {createOwnerPrincipalResolver}=require('./ownerPrincipal');
function createProductionControl(env=process.env,{Pool,loadSdk=()=>require('../../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client'),processFactory=createWebProcess}={}){
 let pool;
 try{
 if(env.WEB_CONTROL_ENABLED!==undefined&&!['0','1'].includes(env.WEB_CONTROL_ENABLED))c.deny('UNAVAILABLE');
 const enabled=env.WEB_CONTROL_ENABLED==='1',port=env.WEB_CONTROL_PORT===undefined?8082:Number(env.WEB_CONTROL_PORT),host=env.WEB_CONTROL_HOST||'127.0.0.1';
 if(!Number.isInteger(port)||port<1||port>65535)c.deny('UNAVAILABLE');
 if(!enabled)return processFactory({enabled:false,port,host});
 const required=name=>{const v=env[name];if(typeof v!=='string'||!v.trim())c.deny('UNAVAILABLE');return v;};
 const database=required('WEB_CONTROL_POSTGRES_URL');if(!['postgres:','postgresql:'].includes(new URL(database).protocol))c.deny('UNAVAILABLE');
 const projectEndpoint=endpoint(required('WEB_CONTROL_PROJECT_ACCESS_URL')),ownerEndpoint=endpoint(required('WEB_CONTROL_OWNER_ACCESS_URL'));
 const apiBaseUrl=endpoint(required('WEB_CONTROL_SENTINEL_URL')),agentId=c.identifier(required('WEB_CONTROL_AGENT_ID'));
 const clientId=required('WEB_CONTROL_SENTINEL_CLIENT_ID'),clientSecret=required('WEB_CONTROL_SENTINEL_CLIENT_SECRET');
 const pilotPolicy=createPilotPolicy(env,'WEB_CONTROL');
 const issuer=c.identifier(required('WEB_CONTROL_CONFIRM_ISSUER')),keyId=c.identifier(required('WEB_CONTROL_CONFIRM_KEY_ID')),policyVersion=pilotPolicy.policyVersion;
 // Protected, non-symlink private-key file; no key in argv or diagnostics.
 const fd=fs.openSync(required('WEB_CONTROL_SIGNING_KEY_FILE'),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 let privateKey;try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>8192||(stat.mode&0o077)!==0)c.deny('UNAVAILABLE');privateKey=fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}
 const Sdk=loadSdk().TraylinxAuthClient;const sdk=new Sdk(clientId,clientSecret,apiBaseUrl,agentId,{timeout:3000,maxRetries:0});
 const resolveHuman=pilotPolicy.wrap(createProjectPrincipalResolver({endpoint:projectEndpoint}));const authorizeOwner=pilotPolicy.wrapOwner(createOwnerPrincipalResolver({url:ownerEndpoint,sdk,agentUserId:agentId}));
 const PgPool=Pool||require('pg').Pool;pool=new PgPool({connectionString:database,max:2,connectionTimeoutMillis:2000,idleTimeoutMillis:10000,statement_timeout:5000,query_timeout:6000,application_name:'web-control-v1'});pool.on('error',()=>{});
 // Construct/validate signing authority before connecting or opening HTTP.
 const application=createHeadlessApprovalApplication({enabled:true,pool,resolveHuman,authorizeOwner,privateKey,issuer,keyId,policyVersion,validateTargets:pilotPolicy.targets});
 let closed=false;const clients={pool,async open(){if(closed)c.deny('UNAVAILABLE');await pool.query('SELECT 1');},async close(){if(closed)return;closed=true;await pool.end();}};
 return processFactory({enabled:true,host,port,clients,applicationFactory:()=>({app:application.app,start(){},async stop(){}})});
 }catch{if(pool)void pool.end().catch(()=>{});c.deny('UNAVAILABLE');}
}
module.exports={createProductionControl};
