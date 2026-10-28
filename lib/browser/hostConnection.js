'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createPrivateKey,createPublicKey}=require('node:crypto');
const c=require('./contracts');
// Installation configuration, not a website recipe. Supplied only by the host.
function loadHostConnection(file){
 let fd,bytes;
 try{
  if(typeof file!=='string'||!path.isAbsolute(file)||!fs.constants.O_NOFOLLOW||typeof process.getuid!=='function')c.deny('UNAVAILABLE');
  fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);const stat=fs.fstatSync(fd);
  if(!stat.isFile()||stat.uid!==process.getuid()||(stat.mode&0o077)!==0||stat.size>16384)c.deny('UNAVAILABLE');
  bytes=Buffer.alloc(16385);const count=fs.readSync(fd,bytes,0,bytes.length,0);if(count>16384)c.deny('UNAVAILABLE');
  const data=JSON.parse(bytes.subarray(0,count).toString('utf8'));
  if(Object.keys(data).sort().join(',')!=='bound,grantId,privateKey,url')c.deny('UNAVAILABLE');
  const bound=c.binding(data.bound);c.validate(c.id,data.grantId);const url=new URL(data.url);
  if(url.protocol!=='https:'||url.pathname!=='/api/browser/v1'||url.username||url.password||url.search||url.hash)c.deny('UNAVAILABLE');
  const privateKey=createPrivateKey(data.privateKey),pem=createPublicKey(privateKey).export({format:'pem',type:'spki'});data.privateKey='';
  if(privateKey.asymmetricKeyType!=='ed25519'||c.fingerprint(pem)!==bound.hostKeyFingerprint)c.deny('UNAVAILABLE');
  return {url:url.href,bound,grantId:data.grantId,privateKey};
 }catch{c.deny('UNAVAILABLE');}finally{bytes?.fill(0);if(fd!==undefined)fs.closeSync(fd);}
}
module.exports={loadHostConnection};
