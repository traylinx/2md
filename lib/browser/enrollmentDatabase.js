'use strict';
const c=require('./contracts');
// Inspect effective privileges, not just connection strings. Never mutate roles.
const text=`SELECT current_user AS role,current_database() AS database,
 has_table_privilege(current_user,'web_browser.grants','SELECT') AS readable,
 has_table_privilege(current_user,'web_browser.grants','INSERT') AS insertable,
 has_any_column_privilege(current_user,'web_browser.grants','UPDATE') AS writable,
 has_column_privilege(current_user,'web_browser.grants','revoked','UPDATE') AS revocable,
 has_table_privilege(current_user,'web_browser.grants','DELETE') AS deletable,
 has_table_privilege(current_user,'web_browser.grants','TRUNCATE') AS truncatable,
 EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='web_browser.grants'::regclass
  AND attnum>0 AND NOT attisdropped AND attname<>'revoked'
  AND has_column_privilege(current_user,'web_browser.grants',attname,'UPDATE')) AS other_update`;
async function verifyEnrollmentRoles(reader,writer){
 try{
  const [a,b]=await Promise.all([reader.query({text,query_timeout:5000}),writer.query({text,query_timeout:5000})]);
  const r=a.rows[0],w=b.rows[0];
  if(a.rows.length!==1||b.rows.length!==1||!r.role||!w.role||r.role===w.role||r.database!==w.database||
   r.readable!==true||r.insertable!==false||r.writable!==false||r.deletable!==false||r.truncatable!==false||
   w.readable!==true||w.insertable!==true||w.revocable!==true||w.other_update!==false||w.deletable!==false||w.truncatable!==false)c.deny('UNAVAILABLE');
 }catch{c.deny('UNAVAILABLE');}
}
module.exports={verifyEnrollmentRoles};
