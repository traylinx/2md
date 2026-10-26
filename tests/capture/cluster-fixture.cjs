'use strict';
// Owned deployment-qualification fixture only. Not included in the runtime image.
const https = require('node:https'), fs = require('node:fs');
const prefix = process.env.FIXTURE_PREFIX;
const account = 'synthetic-user';
const article = '<h1>Owned private report</h1><p>Deterministic private report for bounded capture deployment qualification.</p>';
const form = `<form id="login" action="${prefix}/login" method="post"><input id="user" name="username"><input id="pass" name="password" type="password"><button id="submit" type="submit">Sign in</button></form>`;
const tls = { key: fs.readFileSync('/tls/tls.key'), cert: fs.readFileSync('/tls/tls.crt'), minVersion: 'TLSv1.2' };
https.createServer(tls, (req, res) => {
  res.setHeader('Cache-Control','no-store');
  if (req.url === prefix+'/identity') {
    res.setHeader('Content-Type','application/json');
    if (req.headers.authorization !== 'Bearer synthetic-lab-token') { res.writeHead(401); return res.end('{}'); }
    return res.end(JSON.stringify({data:{type:'user',id:'lab-agent'},messages:[{status:200}]}));
  }
  res.setHeader('Content-Type','text/html');
  if (req.url === prefix+'/login' && req.method === 'POST') {
    let body='';req.on('data',c=>{body+=c;if(body.length>1024)req.destroy()});
    return req.on('end',()=>{
      const data=new URLSearchParams(body);body='';
      if(data.get('username')!==account || data.get('password')!=='SYNTHETIC_PASSWORD_CANARY')return res.end(form);
      res.writeHead(303,{'Location':prefix+'/report','Set-Cookie':`capture-fixture=SYNTHETIC_SESSION_CANARY; Path=${prefix}; Secure; HttpOnly; SameSite=Strict`});res.end();
    });
  }
  if(req.url===prefix+'/login')return res.end(form);
  if(req.url===prefix+'/report')return res.end(req.headers.cookie?.includes('SYNTHETIC_SESSION_CANARY')?article+`<div id="identity" data-user="${account}">Verified</div>`:form);
  if(req.url===prefix+'/article')return res.end(article);
  if(req.url===prefix+'/never')return;
  res.writeHead(404);res.end('not found');
}).listen(8445,'0.0.0.0');
https.createServer({key:fs.readFileSync('/fixtures/key.pem'),cert:fs.readFileSync('/fixtures/cert.pem')},(_q,r)=>r.end('UNTRUSTED_CERT_MUST_NOT_PASS')).listen(8446,'0.0.0.0');
