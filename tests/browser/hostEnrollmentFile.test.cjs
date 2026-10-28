'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHostIdentity,saveHostConnection}=require('../../lib/browser/hostEnrollmentFile');
const {loadHostConnection}=require('../../lib/browser/hostConnection');
const {principal}=require('./support.cjs');
test('installer creates compatible owner-only host file without manual JSON and never overwrites it',()=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'gb01-enroll-')));fs.chmodSync(dir,0o700);
 try{
 const identity=createHostIdentity(),bound={principal,hostId:identity.hostId,hostKeyFingerprint:identity.hostKeyFingerprint},file=path.join(dir,'browser.json');
 const input={file,url:'https://browser.example.org/api/browser/v1',bound,grantId:'grant1',privateKey:identity.privateKey};
 assert.deepEqual(saveHostConnection(input),{file});assert.equal(fs.statSync(file).mode&0o777,0o600);assert.equal(loadHostConnection(file).bound.hostId,identity.hostId);
 const before=fs.readFileSync(file);assert.throws(()=>saveHostConnection(input));assert.deepEqual(fs.readFileSync(file),before);
 const link=path.join(dir,'link.json');fs.symlinkSync(file,link);assert.throws(()=>saveHostConnection({...input,file:link}));assert.deepEqual(fs.readFileSync(file),before);
 fs.chmodSync(dir,0o755);assert.throws(()=>saveHostConnection({...input,file:path.join(dir,'unsafe.json')}));assert.equal(fs.existsSync(path.join(dir,'unsafe.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
