'use strict';
const express=require('express');
const {createPrivateKey,sign,timingSafeEqual}=require('node:crypto');
const c=require('./contracts');
const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
// Separate first-party control application only. Never mount in the proposer or
// accept its bearer. resolveSession must validate a server-owned human session,
// returning current principal, a session-bound CSRF token and stable confirmation ID.
function createConfirmationControl({origin,privateKey,issuer,keyId,resolveSession,loadPlan,confirm}={}){
 let key;
 try{const url=new URL(origin);if(url.protocol!=='https:'||url.origin!==origin)throw Error();
 key=createPrivateKey(privateKey);if(key.asymmetricKeyType!=='ed25519')throw Error();
 c.identifier(issuer);c.identifier(keyId);
 if([resolveSession,loadPlan,confirm].some(v=>typeof v!=='function'))throw Error();
 }catch{c.deny('UNAVAILABLE');}
 const router=express.Router();
 router.use((req,res,next)=>{
 res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
 'Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});
 // No CORS, bearer fallback, agent proof, or embedding in model-controlled UI.
 if(req.get('authorization')||req.get('x-agent-user-id')||req.get('x-agent-secret-token'))return res.status(403).send('Forbidden');
 if(req.get('origin')&&req.get('origin')!==origin)return res.status(403).send('Forbidden');
 next();
 });
 router.use(express.urlencoded({extended:false,limit:'4kb',parameterLimit:4}));
 const handle=operation=>async(req,res)=>{
 const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),5000);
 const closed=()=>{if(!res.writableEnded)abort.abort();};res.on('close',closed);
 try{
 const planId=c.identifier(req.params.planId);
 const session=await resolveSession({cookie:req.get('cookie'),planId,signal:abort.signal});
 c.exact(session,['principal','csrfToken','confirmationId']);const principal=c.executionPrincipal(session.principal);
 if(principal.kind!=='human')c.deny('FORBIDDEN');
 if(typeof session.csrfToken!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(session.csrfToken))c.deny('FORBIDDEN');
 c.identifier(session.confirmationId);
 const plan=c.plan(await loadPlan({planId,principal,signal:abort.signal}));c.bindPrincipal(principal,plan);
 if(plan.planId!==planId||plan.expiresAt<=Date.now())c.deny('STALE_PLAN');
 if(abort.signal.aborted)c.deny('UNAVAILABLE');
 await operation(req,res,{session,principal,plan,signal:abort.signal});
 }catch(e){const code=e instanceof c.WebBoundaryError?e.code:'UNAVAILABLE';
 res.status(code==='STALE_PLAN'?409:['FORBIDDEN','INVALID_INPUT','INVALID_CONFIRMATION'].includes(code)?403:503).type('text').send(code==='STALE_PLAN'?'Plan expired. Request a new plan.':'Confirmation unavailable.');
 }finally{clearTimeout(timer);res.removeListener('close',closed);}
 };
 router.get('/:planId',handle(async(_req,res,{session,plan})=>{
 const digest=c.digest(plan);
 res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Confirm public read</title><h1>Confirm public read</h1><p>This action reads only these public URLs:</p><ul>${plan.urls.map(u=>`<li>${escape(u)}</li>`).join('')}</ul><dl><dt>Project</dt><dd>${escape(plan.projectId)}</dd><dt>Deadline</dt><dd>${plan.deadlineMs} ms</dd><dt>Maximum response</dt><dd>${plan.maxResponseBytes} bytes</dd><dt>Retention</dt><dd>Transient</dd><dt>Output</dt><dd>${escape(plan.outputSchema)}</dd><dt>Plan digest</dt><dd>${digest}</dd></dl><form method="post"><input type="hidden" name="csrfToken" value="${escape(session.csrfToken)}"><input type="hidden" name="planDigest" value="${digest}"><button type="submit">Confirm this plan</button></form><p>Close this page to decline. Nothing runs merely by viewing this page.</p></html>`);
 }));
 router.post('/:planId',handle(async(req,res,{session,principal,plan,signal})=>{
 if(req.get('origin')!==origin)c.deny('FORBIDDEN');
 c.exact(req.body,['csrfToken','planDigest']);
 const given=Buffer.from(typeof req.body.csrfToken==='string'?req.body.csrfToken:'');const expected=Buffer.from(session.csrfToken);
 if(given.length!==expected.length||!timingSafeEqual(given,expected)||req.body.planDigest!==c.digest(plan))c.deny('INVALID_CONFIRMATION');
 const now=Math.floor(Date.now()/1000),exp=Math.min(now+120,Math.floor(plan.expiresAt/1000));
 if(exp<=now)c.deny('STALE_PLAN');
 const payload={iss:issuer,aud:'web-read-confirmation',scope:'web:confirm',sub:principal.authSubject,
 workspaceUserId:principal.workspaceUserId,organizationId:principal.organizationId,projectId:principal.projectId,
 planId:plan.planId,planDigest:c.digest(plan),confirmationId:session.confirmationId,iat:now,exp};
 const message=[{alg:'EdDSA',typ:'web-confirm+jwt',kid:keyId},payload].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 const confirmationProof=message+'.'+sign(null,Buffer.from(message),key).toString('base64url');
 // Proof stays server-to-server. Caller cannot choose the confirmation ID.
 const result=await confirm({planId:plan.planId,principal,confirmationId:session.confirmationId,confirmationProof,signal});
 c.exact(result,['confirmationId','planDigest']);
 if(result.confirmationId!==session.confirmationId||result.planDigest!==payload.planDigest)c.deny('UNAVAILABLE');
 if(signal.aborted)c.deny('UNAVAILABLE');
 res.type('html').send('<!doctype html><title>Plan confirmed</title><h1>Plan confirmed</h1><p>You can return to your task. Confirmation does not itself start execution.</p>');
 }));
 router.use((_error,_req,res,_next)=>res.status(400).type('text').send('Invalid request.'));
 return router;
}
module.exports={createConfirmationControl};
