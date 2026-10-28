'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {extractionEvidence}=require('../../lib/browser/evidence');
const c=require('../../lib/browser/contracts');
const source={url:'https://site.example.org/account',title:'Owned',capturedAt:Date.now(),privacy:'private'};
test('current-page evidence preserves attribution, text and honest quality',()=>{
 const result=extractionEvidence({source,markdown:'# Account\n\nFive owned messages.\n\n| Plan | Price |\n|---|---|\n| Go | $11 |'});
 c.parseResult('browser_extract',result);assert.equal(result.quality,'usable');assert.equal(result.source.privacy,'private');assert.equal(result.evidence.length,3);
 assert.ok(result.evidence.every(e=>result.markdown.includes(e.text)));
 assert.deepEqual(result.evidence,extractionEvidence({source,markdown:result.markdown}).evidence);
 assert.equal(extractionEvidence({source,markdown:'Login',state:{password:true}}).quality,'blocked');
 assert.equal(extractionEvidence({source,markdown:'Partial',warnings:['RESOURCE_BLOCKED']}).quality,'degraded');
});
test('evidence and Markdown limits explicitly report truncation',()=>{
 const r=extractionEvidence({source,markdown:'x'.repeat(600000)});assert.equal(r.truncated,true);assert.ok(r.warnings.includes('CONTENT_TRUNCATED'));assert.ok(r.evidence.every(e=>e.text.length<=8192));
 const many=extractionEvidence({source,markdown:Array.from({length:210},(_,i)=>'item '+i).join('\n\n')});assert.equal(many.evidence.length,200);assert.equal(many.truncated,true);
});
