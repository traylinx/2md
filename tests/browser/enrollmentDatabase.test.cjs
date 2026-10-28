'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {verifyEnrollmentRoles}=require('../../lib/browser/enrollmentDatabase');
const reader={role:'reader',database:'web',readable:true,insertable:false,writable:false,revocable:false,deletable:false,truncatable:false,other_update:false};
const writer={...reader,role:'writer',insertable:true,writable:true,revocable:true};
const pool=row=>({query:async q=>{assert.match(q.text,/SELECT current_user/);assert.equal(q.query_timeout,5000);return {rows:[row]};}});
test('enrollment requires separate scoped effective database permissions',async()=>{
 await verifyEnrollmentRoles(pool(reader),pool(writer));
 for(const changed of [{role:'reader'},{database:'other'},{other_update:true},{deletable:true},{truncatable:true},{insertable:false},{revocable:false}])await assert.rejects(verifyEnrollmentRoles(pool(reader),pool({...writer,...changed})),{code:'UNAVAILABLE'});
 for(const changed of [{insertable:true},{writable:true},{deletable:true},{truncatable:true}])await assert.rejects(verifyEnrollmentRoles(pool({...reader,...changed}),pool(writer)),{code:'UNAVAILABLE'});
 await assert.rejects(verifyEnrollmentRoles({query:async()=>{throw Error('private database details');}},pool(writer)),{code:'UNAVAILABLE'});
});
