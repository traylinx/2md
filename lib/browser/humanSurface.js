'use strict';
const http=require('node:http'),{randomBytes}=require('node:crypto');
const c=require('./contracts'),h=require('./humanContracts');
const token=()=>randomBytes(32).toString('base64url');
// The enrolled local host is the authority. A launch link is a one-use bearer
// capability, not proof of a human identity. Keep pixels/input outside MCP.
async function createHumanSurface({client,now=Date.now}={}){
 if(typeof client?.protectedCall!=='function')c.deny('UNAVAILABLE');
 const launches=new Map(),sessions=new Map();let origin,closed=false;
 function sweep(){for(const map of [launches,sessions])for(const [key,r]of map)if(r.expiresAt<=now())map.delete(key);}
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
   const r=launches.get(launch[1]);if(!r)c.deny('FORBIDDEN');launches.delete(launch[1]);
   const cookie=token();sessions.set(cookie,r);res.setHeader('Set-Cookie',`traylinx_takeover=${cookie}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1,Math.floor((r.expiresAt-now())/1000))}`);
   res.writeHead(303,{Location:'/viewer'});return res.end();
  }
  if(req.headers['sec-fetch-site']==='cross-site')c.deny('FORBIDDEN');
  const cookies=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('traylinx_takeover='));
  if(cookies.length!==1)c.deny('FORBIDDEN');const r=sessions.get(cookies[0].slice('traylinx_takeover='.length));if(!r)c.deny('FORBIDDEN');
  if(req.method==='GET'&&url.pathname==='/viewer'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(viewer(nonce,r.csrf,r.expiresAt));}
  if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-csrf-token']!==r.csrf||req.headers['content-type']!=='application/json')c.deny('FORBIDDEN');
  let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>20000)c.deny('LIMIT_EXCEEDED');body+=chunk.toString('utf8');}
  let input;try{input=JSON.parse(body);}catch{c.deny('INVALID_INPUT');}body='';
  const lease={sessionId:r.sessionId,handoffId:r.handoffId};let result;
  if(url.pathname==='/state'){c.parse(c.obj({}),input);result=await client.protectedCall('human-state',lease);}
  else if(url.pathname==='/frame'){c.parse(c.obj({}),input);result=await client.protectedCall('human-frame',lease);}
  else if(url.pathname==='/input'){
   c.parse(c.obj({actionId:c.id,frameId:c.id,input:h.command.properties.input}),input);
   result=await client.protectedCall('human-input',{...lease,runtimeEpoch:r.runtimeEpoch,...input});
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
 return Object.freeze({urlFor(record,runtimeEpoch){sweep();for(const [key,r]of launches)if(r.handoffId===record.handoffId)launches.delete(key);if(launches.size+sessions.size>=8)c.deny('CAPACITY');const id=token();launches.set(id,{sessionId:record.sessionId,handoffId:record.handoffId,expiresAt:record.expiresAt,runtimeEpoch,csrf:token()});return `${origin}/takeover/${id}`;},async close(){closed=true;launches.clear();sessions.clear();server.closeAllConnections();await new Promise(r=>server.close(r));}});
}
function viewer(nonce,csrf,expiresAt){return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Traylinx · Your browser session</title>
<style nonce="${nonce}">body{font:16px system-ui;background:#10121a;color:#eee;margin:24px}button,input,select{font:inherit;padding:10px;margin:4px}img{display:block;width:min(100%,1280px);height:auto;border:1px solid #888;cursor:crosshair}#decision{border:1px solid #dd9;padding:12px;white-space:pre-wrap}#status{min-height:28px}input{max-width:400px}button{cursor:pointer}h1{font-size:24px}#site{overflow-wrap:anywhere}</style>
<h1>Continue in the same Traylinx browser</h1><p>This is your existing remote session. The agent is paused. Complete only the requested login or human verification. No purchases, messages, uploads or account changes.</p><p id="site"></p><p id="expiry"></p><p id="status" role="status">Connecting…</p>
<button id="refresh">Refresh view / recover status</button><button id="finish">Return to agent</button>
<div id="decision" hidden><p id="request"></p><button id="allow">Allow this request</button><button id="deny">Deny</button></div>
<img id="screen" alt="Remote browser view. Click a control to interact." tabindex="0" hidden>
<p>Click the remote input, then supply text here. It is sent only to this session, not your agent.</p>
<input id="text" type="password" autocomplete="off" maxlength="4096" aria-label="Text for focused remote field"><button id="type">Type into focused field</button>
<select id="key" aria-label="Remote key">${['Tab','Enter','Backspace','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Space'].map(k=>`<option>${k}</option>`).join('')}</select><button id="press">Press key</button><button id="up">Scroll up</button><button id="down">Scroll down</button>
<script nonce="${nonce}">
const csrf=${JSON.stringify(csrf)},$=id=>document.getElementById(id),screen=$('screen');let frame=null,busy=false,stopped=false,pending=null,timer;
async function api(path,input={}){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(input),cache:'no-store',signal:AbortSignal.timeout(40000)});const value=await r.json();if(!r.ok)throw Error(value.error||'UNAVAILABLE');return value;}
function say(value){$('status').textContent=value;}
function hide(){frame=null;screen.hidden=true;screen.removeAttribute('src');}
function decision(value){pending=value||null;$('decision').hidden=!pending;if(pending)$('request').textContent='Paused request: '+pending.method+' '+pending.origin+' ('+pending.type+', '+pending.bodyBytes+' bytes). Exact digest: '+pending.operationDigest+'. '+(pending.reason==='recipient'?'This destination becomes an approved recipient for this private session. ':'')+'Allow only if needed for your requested login or verification.';}
async function refresh(){const s=await api('/state');if(s.state!=='human_control'){stopped=true;hide();decision(null);say(s.state==='agent_control'?'Returned to agent. Tell your agent to continue.':'Session expired. Return to your agent.');return;}decision(s.pending);if(s.action&&['running','needs_input'].includes(s.action.state)){hide();say(s.pending?'Review the paused request below.':'Action is still running; checking its original receipt.');timer=setTimeout(()=>guard(refresh),2000);return;}if(s.action?.state==='outcome_unknown'){hide();say('Outcome unknown. Do not repeat the action. Return to your agent.');return;}const f=await api('/frame');frame=f;screen.src='data:image/jpeg;base64,'+f.jpeg;screen.hidden=false;$('site').textContent='Current site: '+f.origin;say(s.action?.state==='failed'?'Last action stopped: '+s.action.error+'. View refreshed.':'Click the remote page. When finished choose Return to agent.');}
async function guard(work){if(busy||stopped)return;busy=true;clearTimeout(timer);say('Working in your remote session…');for(const b of document.querySelectorAll('button'))b.disabled=true;try{await work();}catch(e){frame=null;say('Stopped: '+e.message+'. Use Refresh to recover status; do not repeat an uncertain input.');}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=stopped;}}
async function input(value){if(!frame)throw Error('Refresh the view first');const id=frame.frameId;frame=null;await api('/input',{actionId:crypto.randomUUID(),frameId:id,input:value});await refresh();}
screen.onclick=e=>guard(()=>{const r=screen.getBoundingClientRect();return input({type:'click',x:Math.min(1279,Math.floor((e.clientX-r.left)*1280/r.width)),y:Math.min(799,Math.floor((e.clientY-r.top)*800/r.height))});});
$('refresh').onclick=()=>guard(refresh);$('up').onclick=()=>guard(()=>input({type:'scroll',deltaY:-600}));$('down').onclick=()=>guard(()=>input({type:'scroll',deltaY:600}));
$('type').onclick=()=>guard(()=>{const text=$('text').value;$('text').value='';return input({type:'text',text});});$('press').onclick=()=>guard(()=>input({type:'key',key:$('key').value}));
for(const choice of ['allow','deny'])$(choice).onclick=()=>guard(async()=>{if(!pending)return;await api('/decision',{operationId:pending.operationId,operationDigest:pending.operationDigest,decision:choice==='allow'?'approve':'deny'});decision(null);await refresh();});
$('finish').onclick=()=>guard(async()=>{await api('/finish');stopped=true;hide();decision(null);$('text').value='';say('Returned to agent. Tell your agent to continue; it will observe this same session.');});
$('expiry').textContent='This handoff expires at '+new Date(${JSON.stringify(expiresAt)}).toLocaleTimeString()+'. Keep this tab open until you return to the agent.';
guard(refresh);
</script></html>`;}
module.exports={createHumanSurface};
