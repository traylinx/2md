'use strict';
const http=require('node:http'),{randomBytes,createHash}=require('node:crypto');
const c=require('./contracts'),h=require('./humanContracts');
const {bootHumanViewer}=require('./humanViewer');
const token=()=>randomBytes(32).toString('base64url');
// The enrolled local host is the authority. A launch link is a one-use bearer
// capability, not proof of a human identity. Keep pixels/input outside MCP.
async function createHumanSurface({client,now=Date.now,onLease=()=>{}}={}){
 if(typeof client?.protectedCall!=='function')c.deny('UNAVAILABLE');
 const launches=new Map(),sessions=new Map(),pastLaunches=new Map();let origin,closed=false;
 const digest=value=>createHash('sha256').update(value).digest('hex');
 function remember(key,record,state){
  pastLaunches.set(digest(key),{state,expiresAt:record.expiresAt,forgetAt:now()+600000});
  while(pastLaunches.size>32)pastLaunches.delete(pastLaunches.keys().next().value);
 }
 function sweep(){
  for(const [key,r]of launches)if(r.expiresAt<=now()){remember(key,r,'expired');launches.delete(key);}
  for(const [key,r]of sessions)if(r.expiresAt<=now())sessions.delete(key);
  for(const [key,r]of pastLaunches)if(r.forgetAt<=now())pastLaunches.delete(key);
 }
 function launchMessage(res,record){
  const expired=record.state==='expired'||record.expiresAt<=now();
  res.statusCode=expired?410:403;res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Traylinx handoff unavailable</title><h1>'+
   (expired?'This handoff link has expired':record.state==='replaced'?'This handoff link was replaced':'This one-use handoff link was already opened')+'</h1><p>'+
   (expired?'The remote handoff is no longer available. This does not mean your website credentials were rejected. Return to your agent and request a fresh authorized browser session and handoff. Do not retry the old link.':
   record.state==='replaced'?'Use the latest link provided by your agent for the existing session. Do not repeat the login submission.':'Use the original viewer tab if it is still open. Otherwise ask your agent to check the existing session and issue a fresh link if it is still active. Do not repeat the login submission.')+
   '</p><p>Keep the MCP client running and open a new handoff link before its displayed expiry.</p></html>');
 }
 const server=http.createServer((req,res)=>{void handle(req,res).catch(error=>{if(!res.headersSent)res.writeHead(c.publicError(error).status,{'Content-Type':'application/json'});res.end(JSON.stringify(c.publicError(error).body));});});
 async function handle(req,res){
  sweep();const nonce=token();
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`);
  const names=req.rawHeaders.filter((_,i)=>i%2===0).map(x=>x.toLowerCase());
  if(closed||['host','origin','cookie','content-type','x-csrf-token'].some(k=>names.filter(x=>x===k).length>1)||req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin)c.deny('FORBIDDEN');
  const url=new URL(req.url,origin);if(url.search)c.deny('FORBIDDEN');
  const launch=/^\/takeover\/([A-Za-z0-9_-]{43})$/.exec(url.pathname);
  if(req.method==='GET'&&launch){
   const r=launches.get(launch[1]);if(!r){const past=pastLaunches.get(digest(launch[1]));if(past)return launchMessage(res,past);c.deny('FORBIDDEN');}remember(launch[1],r,'opened');launches.delete(launch[1]);
   const cookie=token();sessions.set(cookie,r);res.setHeader('Set-Cookie',`traylinx_takeover=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1,Math.floor((r.expiresAt-now())/1000))}`);
   res.writeHead(303,{Location:'/viewer'});return res.end();
  }
  if(req.headers['sec-fetch-site']==='cross-site')c.deny('FORBIDDEN');
  const cookies=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('traylinx_takeover='));
  if(cookies.length!==1)c.deny('FORBIDDEN');const r=sessions.get(cookies[0].slice('traylinx_takeover='.length));if(!r)c.deny('FORBIDDEN');
  if(req.method==='GET'&&url.pathname==='/viewer'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(viewer(nonce,r.csrf,r.expiresAt,r.viewerV2,r.interaction));}
  if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-csrf-token']!==r.csrf||req.headers['content-type']!=='application/json')c.deny('FORBIDDEN');
  let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>20000)c.deny('LIMIT_EXCEEDED');body+=chunk.toString('utf8');}
  let input;try{input=JSON.parse(body);}catch{c.deny('INVALID_INPUT');}body='';
  const lease={sessionId:r.sessionId,handoffId:r.handoffId};let result;
  if(url.pathname==='/activate'){
   c.parse(c.obj({}),input);if(!r.viewerV2)c.deny('UNSUPPORTED');
   result=await client.protectedCall('human-activate',lease);r.expiresAt=result.expiresAt;onLease(r);
   res.setHeader('Set-Cookie',`${cookies[0]}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1,Math.floor((r.expiresAt-now())/1000))}`);
  }else if(url.pathname==='/view'){
   c.parse(c.obj({}),input);if(!r.viewerV2)c.deny('UNSUPPORTED');result=await client.protectedCall('human-view',lease);
  }else if(url.pathname==='/state'){c.parse(c.obj({}),input);result=await client.protectedCall('human-state',lease);}
  else if(url.pathname==='/frame'){c.parse(c.obj({}),input);result=await client.protectedCall('human-frame',lease);}
  else if(url.pathname==='/input'||url.pathname==='/interact'){
   if(url.pathname==='/interact'&&!r.interaction)c.deny('UNSUPPORTED');
   c.parse(c.obj({actionId:c.id,frameId:c.id,input:h.command.properties.input}),input);
   result=await client.protectedCall(url.pathname==='/interact'?'human-interact':'human-input',{...lease,runtimeEpoch:r.runtimeEpoch,...input});
  }else if(url.pathname==='/decision'){
   c.parse(c.obj({operationId:c.id,operationDigest:c.str(64),decision:{enum:['approve','deny']}}),input);
   result=await client.protectedCall('human-decide',{...lease,...input});
  }else if(url.pathname==='/finish'){
   c.parse(c.obj({}),input);result=await client.protectedCall('human-finish',lease);
   for(const map of [sessions,launches])for(const [key,v]of map)if(v.handoffId===r.handoffId)map.delete(key);
   res.setHeader('Set-Cookie','traylinx_takeover=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  }else c.deny('FORBIDDEN');
  input=null;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }
 server.requestTimeout=45000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
 return Object.freeze({urlFor(record,runtimeEpoch,{viewerV2=false,interaction=false}={}){sweep();for(const [key,r]of launches)if(r.handoffId===record.handoffId){remember(key,r,'replaced');launches.delete(key);}if(launches.size+sessions.size>=8)c.deny('CAPACITY');const id=token();launches.set(id,{sessionId:record.sessionId,handoffId:record.handoffId,expiresAt:record.expiresAt,runtimeEpoch,viewerV2,interaction,csrf:token()});return `${origin}/takeover/${id}`;},async close(){closed=true;launches.clear();sessions.clear();pastLaunches.clear();server.closeAllConnections();await new Promise(r=>server.close(r));}});
}
function viewer(nonce,csrf,expiresAt,viewerV2=false,interaction=false){return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Traylinx · Your browser session</title>
<style nonce="${nonce}">body{font:16px system-ui;background:#10121a;color:#eee;margin:24px}button,input,select{font:inherit;padding:10px;margin:4px}img{display:block;width:min(100%,1280px);height:auto;border:1px solid #888;cursor:crosshair}#viewport{position:relative;width:min(100%,1280px)}#screenCover{position:absolute;inset:0;display:grid;place-items:start center;padding-top:16px;background:rgba(16,18,26,.18);cursor:wait}#screenCover span{background:#10121a;color:#fff;padding:10px 18px;border-radius:6px}#decision{border:1px solid #dd9;padding:12px;white-space:pre-wrap}#status{min-height:28px}input{max-width:400px}button{cursor:pointer}button:disabled{cursor:wait;opacity:.55}img[aria-disabled="true"]{pointer-events:none}h1{font-size:24px}#site{overflow-wrap:anywhere}[hidden]{display:none!important}</style>
<h1>Continue in the same Traylinx browser</h1><p>This is your existing remote session. The agent is paused. Complete only the requested login or human verification. No purchases, messages, uploads or account changes.</p><p id="site"></p><p id="expiry"></p><p id="status" role="status">Connecting…</p>
<button id="refresh">Refresh view / recover status</button><button id="finish">Return to agent</button>
<div id="decision" hidden><p id="request"></p><button id="allow">Allow this request</button><button id="deny">Deny</button></div>
<div id="viewport"><img id="screen" alt="Remote browser view. Click a control to interact." tabindex="0" hidden><div id="screenCover" hidden><span>Updating view — showing the previous image. Please wait.</span></div></div>
<p>Click the remote input, then supply text here. It is sent only to this session, not your agent.</p>
<input id="text" type="password" autocomplete="off" maxlength="4096" aria-label="Text for focused remote field"><button id="type">Type into focused field</button>
<select id="key" aria-label="Remote key">${['Tab','Enter','Backspace','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Space'].map(k=>`<option>${k}</option>`).join('')}</select><button id="press">Press key</button><button id="up">Scroll up</button><button id="down">Scroll down</button>
<script nonce="${nonce}">
const csrf=${JSON.stringify(csrf)};
(${bootHumanViewer.toString()})({csrf,expiresAt:${JSON.stringify(expiresAt)},viewerV2:${JSON.stringify(viewerV2)},interaction:${JSON.stringify(interaction)}});
</script></html>`;}
module.exports={createHumanSurface};
