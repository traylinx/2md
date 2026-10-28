'use strict';
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const c=require('./contracts');
const escape=value=>String(value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
// Local adapter surface: ownerContext MUST verify the paired HttpOnly session.
// No credentials in query strings, MCP elicitation responses, or access logs.
async function createCredentialSurface({provider,ownerContext,pairing,decisions,now=Date.now}={}){
  if(!provider||typeof ownerContext!=='function')c.deny('UNAVAILABLE');
  const csrf=new Map();let origin;
  const server=http.createServer((req,res)=>{void handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(403);res.end('Protected input unavailable.');});});
  async function handle(req,res){
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    for(const [key,record] of csrf)if(record.expiresAt<=now())csrf.delete(key);
    const headers=req.rawHeaders.filter((_,i)=>i%2===0).map(x=>x.toLowerCase());
    if(['host','origin','cookie','content-type'].some(name=>headers.filter(x=>x===name).length>1)||req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin)c.deny('FORBIDDEN');
    const url=new URL(req.url,origin);
    if(pairing&&req.method==='GET'&&url.pathname==='/pair/callback'){
      const cookie=await pairing.callback(url);res.setHeader('Set-Cookie',cookie);res.writeHead(303,{Location:'/paired'});return res.end();
    }
    if(req.headers['sec-fetch-site']==='cross-site')c.deny('FORBIDDEN');
    if(pairing&&req.method==='GET'&&url.pathname==='/paired'&&!url.search){await ownerContext(req);res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><title>Paired</title><p>Owner connection established. Return to your agent.</p>');}
    const match=/^\/(credentials|decisions)\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if(!match||url.search||!['GET','POST'].includes(req.method))c.deny('FORBIDDEN');
    const isDecision=match[1]==='decisions',entryId=match[2];if(isDecision&&!decisions)c.deny('UNSUPPORTED');
    const context=await ownerContext(req);const record=await (isDecision?decisions:provider).inspect(entryId,context);
    if(req.method==='GET'){
      if(csrf.size>=64)c.deny('CAPACITY');
      const token=randomBytes(32).toString('base64url');csrf.set(token,{id:record.interventionId,kind:match[1],expiresAt:record.expiresAt});
      res.setHeader('Content-Type','text/html; charset=utf-8');
      if(isDecision)return res.end(`<!doctype html><title>Traylinx login decision</title><h1>Allow this login step?</h1><p>Site: ${escape(record.origin)}</p><p>${escape(record.purpose)}</p><p>Recipients: ${record.recipients.map(escape).join(', ')}</p><p>Action: ${escape(record.actionId)}</p><p>Fields: ${escape(JSON.stringify(record.fields))}; submit: ${escape(record.submitRef)}</p><p>Only this observed login step. No purchase, message or account change permission.</p><form method="post"><input type="hidden" name="csrf" value="${token}"><button name="decision" value="approve">Allow this login step</button></form>`);
      return res.end(`<!doctype html><title>Traylinx protected login</title><h1>Sign in to ${escape(record.origin)}</h1><p>${escape(record.purpose)}</p><p>Approved recipients: ${record.recipients.map(escape).join(', ')}</p><form method="post"><input type="hidden" name="csrf" value="${token}"><label>Username <input name="username" autocomplete="username" maxlength="4096"></label><label>Password <input name="password" type="password" autocomplete="current-password" maxlength="4096" required></label><p>Allow one login attempt for this session and these recipients. No messages, purchases or account changes.</p><button>Sign in for this session</button></form>`);
    }
    if(req.headers.origin!==origin||!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type']||''))c.deny('FORBIDDEN');
    let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)c.deny('LIMIT_EXCEEDED');body+=chunk.toString('utf8');}
    const fields=new URLSearchParams(body);body='';
    const expected=isDecision?['csrf','decision']:['csrf','username','password'];
    if([...fields.keys()].length!==expected.length||expected.some(k=>fields.getAll(k).length!==1))c.deny('INVALID_INPUT');
    const token=fields.get('csrf'),saved=csrf.get(token);
    if(!saved||saved.id!==record.interventionId||saved.kind!==match[1]||saved.expiresAt<=now())c.deny('FORBIDDEN');csrf.delete(token);
    if(isDecision){if(fields.get('decision')!=='approve')c.deny('INVALID_INPUT');await decisions.approve(record.interventionId,context);res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><title>Prepared</title><p>Login step approved, not executed. Return to your agent to continue the original action.</p>');}
    await provider.submit(record.interventionId,context,{username:fields.get('username'),password:fields.get('password')});
    fields.delete('password');res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>Ready</title><p>Credentials supplied for this session. Return to your agent.</p>');
  }
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
  return Object.freeze({async beginPairing(){if(!pairing)c.deny('UNSUPPORTED');return pairing.begin(origin);},urlFor(id){c.validate(c.id,id);return `${origin}/credentials/${id}`;},decisionUrl(id){c.validate(c.id,id);return `${origin}/decisions/${id}`;},async close(){csrf.clear();decisions?.close();pairing?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}});
}
module.exports={createCredentialSurface};
