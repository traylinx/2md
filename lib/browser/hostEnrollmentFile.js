'use strict';
const fs=require('node:fs'),path=require('node:path');
const {generateKeyPairSync,randomUUID,createPublicKey}=require('node:crypto');
const c=require('./contracts');
const {loadHostConnection}=require('./hostConnection');
function createHostIdentity(){
 const {privateKey,publicKey}=generateKeyPairSync('ed25519'),hostPublicKey=publicKey.export({format:'pem',type:'spki'});
 return {hostId:'host_'+randomUUID(),privateKey,hostPublicKey,hostKeyFingerprint:c.fingerprint(hostPublicKey)};
}
// Installer-owned persistence after verified enrollment, not an MCP tool.
// No overwrite/merge of an existing operator configuration or key file.
function saveHostConnection({file,url,bound,grantId,privateKey}={}){
 let fd,bytes,created=false;
 try{
  if(typeof file!=='string'||!path.isAbsolute(file)||typeof process.getuid!=='function')c.deny('UNAVAILABLE');
  const parent=path.dirname(file),stat=fs.lstatSync(parent);
  if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077)!==0||fs.realpathSync(parent)!==parent)c.deny('UNAVAILABLE');
  const binding=c.binding(bound);c.validate(c.id,grantId);
  const target=new URL(url);if(target.protocol!=='https:'||target.pathname!=='/api/browser/v1'||target.username||target.password||target.search||target.hash)c.deny('UNAVAILABLE');
  if(privateKey?.asymmetricKeyType!=='ed25519'||c.fingerprint(createPublicKey(privateKey).export({format:'pem',type:'spki'}))!==binding.hostKeyFingerprint)c.deny('FORBIDDEN');
  bytes=Buffer.from(JSON.stringify({url:target.href,bound:binding,grantId,privateKey:privateKey.export({format:'pem',type:'pkcs8'})})+'\n');
  if(bytes.length>16384)c.deny('LIMIT_EXCEEDED');
  fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);created=true;
  fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  loadHostConnection(file);return {file};
 }catch(error){if(created){try{fs.unlinkSync(file);}catch{}}if(error instanceof c.BrowserError)throw error;c.deny('UNAVAILABLE');}
 finally{bytes?.fill(0);if(fd!==undefined)fs.closeSync(fd);}
}
module.exports={createHostIdentity,saveHostConnection};
