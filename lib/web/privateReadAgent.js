'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {CaptureError}=require('../capture/errors');
const {exactKeys,validateRequest}=require('../capture/requestContract');
const {freezeRecipe}=require('../capture/recipe');
const definitions=[
 {name:'list_login_connections',description:'Discover caller-configured website connections and declarative login hints; never returns usernames, passwords or sessions. These are client settings, not proof of server permission. No login or read occurs.',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'propose_authenticated_read',description:'Prepare an ephemeral private read. Use a connectionId from list_login_connections, not credentials in arguments. Optional loginUrl/login override caller hints with declarative form or XHR instructions. Does not log in. Preview only when requested; an explicit login/read request needs no redundant chat approval within configured permission.',inputSchema:{type:'object',properties:{connectionId:{type:'string'},url:{type:'string'},loginUrl:{type:'string'},login:{type:'object',description:'Native: submitPath,readPaths,fields{form,username,password,submit},proof{selector,attribute},optional resourcePaths. XHR: mode:xhr,postUrls (ordered exact auth URLs, max3),readUrls (exact GET API URLs),readPaths (page paths),fields,proof{url,path:[JSON keys]},optional resourceUrls (exact external JS/CSS). No scripts, wildcards or secrets.'},budgetMs:{type:'integer',minimum:1000,maximum:60000,default:60000}},required:['connectionId','url'],additionalProperties:false}},
 {name:'run_authenticated_read',description:'Run the same private plan once in a fresh isolated browser. Returns extracted private evidence directly; no public run polling. Repeating this plan returns the existing result/status, never another login. On uncertain/failed state STOP; never silently create a new plan. Plan/results expire and are lost on MCP restart; private data never enters the durable public queue.',inputSchema:{type:'object',properties:{planId:{type:'string'}},required:['planId'],additionalProperties:false}}
];
function createPrivateReadAgent({connections,capture,now=Date.now}={}){
 const plans=new Map();const ttl=10*60*1000;
 function sweep(){for(const [id,p]of plans)if(p.expiresAt<=now()&&p.state!=='running')plans.delete(id);}
 function authorize(connection,request){
  const recipe=freezeRecipe(request);
  const urls=[request.url,request.loginUrl,...(recipe.mode==='xhr'?[...recipe.postUrls,...recipe.readUrls,...recipe.resourceUrls]:[])];
  const posts=recipe.mode==='xhr'?recipe.postUrls:[recipe.origin+recipe.submitPath];
  if(urls.some(u=>!connection.origins.includes(new URL(u).origin))||posts.some(u=>!connection.postUrls.includes(u)))throw new CaptureError('FORBIDDEN');
 }
 const fingerprint=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 function metadata(v){return {id:v.id,username:v.username,origins:v.origins,postUrls:v.postUrls,loginUrl:v.loginUrl,login:v.login};}
 function result(p){return {planId:p.id,state:p.state,expiresAt:p.expiresAt,...(p.result?{result:p.result}:{}),...(p.error?{error:p.error,recovery:'No automatic retry. Login may have occurred. A new attempt requires an explicit user request.'}:{})};}
 return Object.freeze({definitions,
  async call({name,arguments:args,signal}){
   sweep();if(signal?.aborted)throw new CaptureError('CANCELLED');
   if(name==='list_login_connections'){exactKeys(args??{},[]);return {connections:connections.list(),credentialHandling:'Caller-owned protected file; only opaque IDs enter tool calls. Server receives credentials transiently, never queues or stores them.',supported:['native form login','bounded XHR login','read-only extraction'],unsupported:['MFA/CAPTCHA automation','SSO popups','purchases','business writes','persistent browser sessions'],serverPermission:'Separate capture:authenticated and XHR auth-endpoint grants required; public-read grants do not allow login.'};}
   if(name==='propose_authenticated_read'){
    exactKeys(args,['connectionId','url','loginUrl','login','budgetMs'],['connectionId','url']);
    if(plans.size>=16)throw new CaptureError('CAPACITY');
    const connection=connections.get(args.connectionId);
    try{
     const request=validateRequest({url:args.url,loginUrl:args.loginUrl??connection.loginUrl,login:args.login??connection.login,budgetMs:args.budgetMs??60000,auth:{mode:'inlineOnce',username:connection.username,password:connection.password}},true);
     authorize(connection,request);delete request.auth;
     // Clone the model request so later mutation cannot change the plan.
     const p={id:randomUUID(),request:JSON.parse(JSON.stringify(request)),connectionId:connection.id,connectionHash:fingerprint(metadata(connection)),state:'prepared',expiresAt:now()+ttl};plans.set(p.id,p);const timer=setTimeout(()=>{if(p.state!=='running'&&p.expiresAt<=now())plans.delete(p.id);},ttl);timer.unref?.();
     return {...result(p),url:request.url,loginUrl:request.loginUrl,budgetMs:request.budgetMs,retention:'memory-only; lost on MCP restart',nextTool:'run_authenticated_read',instruction:'Execute for an explicit login/read request. If preview was requested, show task then wait for go. Server authorization is checked at execution.'};
    }finally{connection.username='';connection.password='';}
   }
   if(name==='run_authenticated_read'){
    exactKeys(args,['planId']);const p=plans.get(args.planId);if(!p)throw new CaptureError('INVALID_INPUT');
    if(p.state!=='prepared')return result(p);
    // Mark before any asynchronous action. A timeout is not permission to retry login.
    p.state='running';let connection,request;
    try{
     connection=connections.get(p.connectionId);
     if(fingerprint(metadata(connection))!==p.connectionHash)throw new CaptureError('FORBIDDEN');
     request={...p.request,auth:{mode:'inlineOnce',username:connection.username,password:connection.password}};
     authorize(connection,request);
     p.result=await capture(request,signal);p.state='completed';
    }catch(e){p.error=e instanceof CaptureError?e.code:'UNAVAILABLE';p.state='failed';}
    finally{if(connection){connection.username='';connection.password='';}if(request)request.auth=null;p.expiresAt=now()+ttl;const timer=setTimeout(()=>plans.delete(p.id),ttl);timer.unref?.();}
    return result(p);
   }
   throw new CaptureError('FORBIDDEN');
  }
 });
}
module.exports={createPrivateReadAgent,definitions};
