'use strict';
const c=require('./contracts');
const {createLocalOwnerSession}=require('./localOwnerSession');
const {createCredentialSurface}=require('./credentialSurface');
const {createRemoteCredentialProvider}=require('./remoteCredentialProvider');
// Generic local host setup, with no vendor or website branch. All authority
// checks/exchanges use signed transport, never model tool arguments.
async function createProtectedHost({client,bound,grantId,privateKey}={}){
 if(typeof client?.protectedCall!=='function')c.deny('UNAVAILABLE');
 const pairing=createLocalOwnerSession({bound,grantId,control:{
  begin:(_bound,input)=>client.protectedCall('pair-begin',input),
  exchange:(_bound,input)=>client.protectedCall('pair-exchange',input),
 },authorizeOwner:async({owner})=>(await client.protectedCall('owner-check',{owner})).authorized===true});
 // Context originates only from the surface's verified HttpOnly owner session.
 const provider=createRemoteCredentialProvider({client,bound,grantId,privateKey,verifyOwner:async context=>{
  if((await client.protectedCall('owner-check',{owner:context})).authorized!==true)c.deny('FORBIDDEN');return context;
 }});
 let surface;
 try{surface=await createCredentialSurface({provider,pairing,ownerContext:pairing.ownerContext});}
 catch(error){pairing.close();throw error;}
 return Object.freeze({beginPairing:()=>surface.beginPairing(),credentialUrl:id=>surface.urlFor(id),close:()=>surface.close()});
}
module.exports={createProtectedHost};
