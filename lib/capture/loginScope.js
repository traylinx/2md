'use strict';
const {CaptureError}=require('./errors');
const {parseTarget}=require('./targetPolicy');
function loginGrant(grant){
 const expiry=grant.authenticatedUntil;
 if(expiry!==undefined&&(!Number.isSafeInteger(expiry)||expiry<=0))throw new CaptureError('FORBIDDEN');
 const optional=expiry===undefined?{}:{authenticatedUntil:expiry};
 if(grant.loginPostUrls===undefined)return optional;
 if(!Array.isArray(grant.loginPostUrls)||!grant.loginPostUrls.length||grant.loginPostUrls.length>3)throw new CaptureError('FORBIDDEN');
 const urls=grant.loginPostUrls.map(value=>{const u=parseTarget(value);if(u.protocol!=='https:'||u.href!==value||u.search||u.hash)throw new CaptureError('FORBIDDEN');return value;});
 return {...optional,loginPostUrls:urls};
}
module.exports={loginGrant};
