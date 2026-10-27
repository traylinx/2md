'use strict';
const {createAgentPrincipalResolver,createCallerResolver}=require('./agentPrincipal');
const fs=require('node:fs');
const {createPublicKey}=require('node:crypto');
const c=require('./contracts');
const {endpoint}=require('./dispatch');
const {createRuntimeClients}=require('./runtimeClients');
const {createWebProcess}=require('./process');
const {createProjectPrincipalResolver}=require('./projectPrincipal');
const {createDispatchServiceVerifier}=require('./dispatchServiceVerifier');
function configuration(env){
 const enabled=env.WEB_READ_ENABLED==='1';
 if(env.WEB_READ_ENABLED!==undefined&&!['0','1'].includes(env.WEB_READ_ENABLED))c.deny('UNAVAILABLE');
 const port=env.WEB_READ_PORT===undefined?8081:Number(env.WEB_READ_PORT);
 if(!Number.isInteger(port)||port<1||port>65535)c.deny('UNAVAILABLE');
 const base={enabled,port,host:env.WEB_READ_HOST||'127.0.0.1'};
 if(!enabled)return base;
 const required=name=>{const value=env[name];if(typeof value!=='string'||!value.trim())c.deny('UNAVAILABLE');return value;};
 const url=name=>endpoint(required(name));
 const origins=required('WEB_READ_ORIGINS').split(',');
 for(const origin of origins){const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin)c.deny('UNAVAILABLE');}
 const resultKey=Buffer.from(required('WEB_READ_RESULT_KEY'),'base64');
 if(resultKey.length!==32||resultKey.toString('base64')!==env.WEB_READ_RESULT_KEY)c.deny('UNAVAILABLE');
 const file=required('WEB_READ_CONFIRM_PUBLIC_KEY_FILE');
 const stat=fs.statSync(file);if(!stat.isFile()||stat.size>8192)c.deny('UNAVAILABLE');
 const publicKey=fs.readFileSync(file,'utf8');if(!publicKey.trim().startsWith('-----BEGIN PUBLIC KEY-----'))c.deny('UNAVAILABLE');if(createPublicKey(publicKey).asymmetricKeyType!=='ed25519')c.deny('UNAVAILABLE');
 return {...base,origins,resultKey,publicKey,
 postgresUrl:required('WEB_READ_POSTGRES_URL'),redisUrl:required('WEB_READ_REDIS_URL'),
 agentEndpoint:env.WEB_READ_AGENT_ACCESS_URL?url('WEB_READ_AGENT_ACCESS_URL'):null,projectEndpoint:url('WEB_READ_PROJECT_ACCESS_URL'),ownerEndpoint:url('WEB_READ_OWNER_ACCESS_URL'),searchEndpoint:url('WEB_READ_SEARCH_URL'),
 apiBaseUrl:url('WEB_READ_SENTINEL_URL'),clientId:required('WEB_READ_SENTINEL_CLIENT_ID'),clientSecret:required('WEB_READ_SENTINEL_CLIENT_SECRET'),
 readAgentId:c.identifier(required('WEB_READ_AGENT_ID')),searchAgentId:c.identifier(required('WEB_READ_SEARCH_AGENT_ID')),
 issuer:c.identifier(required('WEB_READ_CONFIRM_ISSUER')),keyId:c.identifier(required('WEB_READ_CONFIRM_KEY_ID')),
 policyVersion:c.identifier(required('WEB_READ_POLICY_VERSION')),workerId:c.identifier(required('WEB_READ_WORKER_ID'))};
}
function createProductionRead(env=process.env,{clientsFactory=createRuntimeClients,processFactory=createWebProcess,
 verifierFactory=createDispatchServiceVerifier,loadSdk=()=>require('../../deploy/capture/sentinel-sdk/node_modules/traylinx-auth-client')}={}){
 let clients,verify,service;
 try{
 const config=configuration(env);
 if(!config.enabled)return processFactory(config);
 const Sdk=loadSdk().TraylinxAuthClient;
 const readSdk=new Sdk(config.clientId,config.clientSecret,config.apiBaseUrl,config.readAgentId,{timeout:3000,maxRetries:0});
 verify=verifierFactory({searchAgentId:config.searchAgentId,apiBaseUrl:config.apiBaseUrl,
 clientId:config.clientId,clientSecret:config.clientSecret,verifierId:config.readAgentId,timeoutMs:3000,loadSdk});
 clients=clientsFactory({postgresUrl:config.postgresUrl,redisUrl:config.redisUrl});
 service=processFactory({enabled:true,host:config.host,port:config.port,clients,allowedOrigins:config.origins,dependencies:{
 resultKey:config.resultKey,resolvePrincipal:createCallerResolver({human:createProjectPrincipalResolver({endpoint:config.projectEndpoint}),agent:config.agentEndpoint?createAgentPrincipalResolver({url:config.agentEndpoint}):async()=>c.deny('FORBIDDEN')}),
 ownerAccessEndpoint:config.ownerEndpoint,confirmationAuthority:{publicKey:config.publicKey,issuer:config.issuer,keyId:config.keyId},
 verifySearchService:verify,readSdk,readAgentId:config.readAgentId,searchAgentId:config.searchAgentId,
 searchEndpoint:config.searchEndpoint,policyVersion:config.policyVersion,workerId:config.workerId}});
 let stopping;
 return Object.freeze({start:()=>service.start(),status:()=>service.status(),stop(){
 if(!stopping)stopping=(async()=>{try{await service.stop();}finally{verify.close?.();}})();return stopping;
 }});
 }catch{
 verify?.close?.();if(clients)void clients.close().catch(()=>{});c.deny('UNAVAILABLE');
 }
}
module.exports={createProductionRead,configuration};
