'use strict';
const http=require('node:http');
const {randomBytes}=require('node:crypto');
const c=require('./contracts');
const escape=value=>String(value).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
// Local adapter surface: ownerContext MUST verify the paired HttpOnly session.
// No credentials in query strings, MCP elicitation responses, or access logs.
async function createCredentialSurface({provider,ownerContext,now=Date.now}={}){
  if(!provider||typeof ownerContext!=='function')c.deny('UNAVAILABLE');
  const csrf=new Map();let origin;
  const server=http.createServer((req,res)=>{void handle(req,res).catch(()=>{if(!res.headersSent)res.writeHead(403);res.end('Protected input unavailable.');});});
  async function handle(req,res){
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    for(const [key,record] of csrf)if(record.expiresAt<=now())csrf.delete(key);
    const headers=req.rawHeaders.filter((_,i)=>i%2===0).map(x=>x.toLowerCase());
    if(['host','origin','cookie','content-type'].some(name=>headers.filter(x=>x===name).length>1)||req.headers.host!==new URL(origin).host||req.headers.origin&&req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site')c.deny('FORBIDDEN');
    const url=new URL(req.url,origin);const match=/^\/credentials\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if(!match||url.search||!['GET','POST'].includes(req.method))c.deny('FORBIDDEN');
    const context=await ownerContext(req);const record=await provider.inspect(match[1],context);
    if(req.method==='GET'){
      if(csrf.size>=64)c.deny('CAPACITY');
      const token=randomBytes(32).toString('base64url');csrf.set(token,{id:record.interventionId,expiresAt:record.expiresAt});
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.end(`<!doctype html><title>Traylinx protected login</title><h1>Sign in to ${escape(record.origin)}</h1><p>${escape(record.purpose)}</p><p>Approved recipients: ${record.recipients.map(escape).join(', ')}</p><form method="post"><input type="hidden" name="csrf" value="${token}"><label>Username <input name="username" autocomplete="username" maxlength="4096"></label><label>Password <input name="password" type="password" autocomplete="current-password" maxlength="4096" required></label><button>Use for this session</button></form>`);
    }
    if(req.headers.origin!==origin||!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type']||''))c.deny('FORBIDDEN');
    let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)c.deny('LIMIT_EXCEEDED');body+=chunk.toString('utf8');}
    const fields=new URLSearchParams(body);body='';
    if([...fields.keys()].length!==3||['csrf','username','password'].some(k=>fields.getAll(k).length!==1))c.deny('INVALID_INPUT');
    const token=fields.get('csrf'),saved=csrf.get(token);
    if(!saved||saved.id!==record.interventionId||saved.expiresAt<=now())c.deny('FORBIDDEN');csrf.delete(token);
    await provider.submit(record.interventionId,context,{username:fields.get('username'),password:fields.get('password')});
    fields.delete('password');res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><title>Ready</title><p>Credentials supplied for this session. Return to your agent.</p>');
  }
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
  return Object.freeze({urlFor(id){c.validate(c.id,id);return `${origin}/credentials/${id}`;},async close(){csrf.clear();server.closeAllConnections();await new Promise(r=>server.close(r));}});
}
module.exports={createCredentialSurface};
