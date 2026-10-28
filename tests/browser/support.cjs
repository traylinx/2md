'use strict';
const {generateKeyPairSync}=require('node:crypto');
const c=require('../../lib/browser/contracts');
const principal={version:1,kind:'agent',authSubject:'agent-1',workspaceUserId:'user-1',organizationId:'org-1',projectId:'project-1',effectiveRole:'MEMBER',stopped:false,
  authorizationRef:{tokenId:'12345678-1234-1234-1234-123456789012',clientId:'client-1',expiresAt:9999999999999,generation:'a'.repeat(64)}};
const owner={version:1,kind:'human',authSubject:'owner-1',workspaceUserId:'owner-user',organizationId:'org-1',projectId:'project-1',effectiveRole:'OWNER',stopped:false};
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const pem=publicKey.export({type:'spki',format:'pem'});
const bound={principal,hostId:'host-1',hostKeyFingerprint:c.fingerprint(pem)};
function grant(now=Date.now()) {return {grantId:'grant-1',agent:c.identity(principal),hostId:bound.hostId,hostPublicKey:pem,
 operations:['browser:public','browser:login_read'],navigation:{mode:'public_https'},limits:{...c.LIMITS},expiresAt:now+3600000};}
function observation() {return {version:1,observationId:'o1',pageId:'p1',
 source:{url:'https://unfamiliar.example.org/',title:'Synthetic fixture',capturedAt:Date.now(),privacy:'public'},
 state:'ready',text:'Synthetic page',controls:[],links:[],pages:[],frames:[],warnings:[],truncated:false};}
module.exports={principal,owner,bound,grant,privateKey,observation};
