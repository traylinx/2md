'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {extract}=require('../../lib/capture/extract');
test('preserves per-card names immediately with their prices, not inferred from another table',()=>{
 const html='<html><body><main><h1>Subscriptions</h1>'+['Alpha','Beta','Gamma'].map((name,i)=>`<article><header><h3>${name}</h3><span>Intro offer</span></header><p>$${(i+1)*10} per month</p><ul><li>Useful feature</li></ul></article>`).join('')+'</main></body></html>';
 const {markdown}=extract(html,'https://example.com/');for(const [i,name] of ['Alpha','Beta','Gamma'].entries())assert.match(markdown,new RegExp('### '+name+'[\\s\\S]*?\\$'+(i+1)*10+' per month'));
});
test('explicit icon labels survive without turning decorative or blank cells into exclusions',()=>{
 const {markdown}=extract('<h1>Features</h1><table><tr><th>Feature</th><th>A</th><th>B</th></tr><tr><td>Included</td><td><span role="img" aria-label="✓"><svg><path /></svg></span></td><td></td></tr><tr><td>Missing</td><td><svg aria-label="Not included"></svg></td><td><svg><path /></svg></td></tr></table>','https://example.com/');
 assert.match(markdown,/\| Included \| ✓ \|\s*\|/);assert.match(markdown,/Not included/);assert.equal((markdown.match(/Not included/g)||[]).length,1);
});
test('full-width category rows keep feature columns rather than flatten the entire table',()=>{
 const r=extract('<h1>Compare</h1><table><thead><tr><th>Feature</th><th>Free</th><th>Paid</th></tr></thead><tbody><tr><th colspan="3">Usage</th></tr><tr><th>Projects</th><td>20</td><td>50</td></tr></tbody></table>','https://example.com/');
 assert.match(r.markdown,/\| Projects \| 20 \| 50 \|/);assert.ok(!r.warnings.includes('MALFORMED_TABLE_TEXT_FALLBACK'));
});
test('unsupported broken geometry stays explicit fallback; accessible secret labels are redacted',()=>{
 const r=extract('<h1>Compare</h1><table><tr><th>Feature</th><th>A</th></tr><tr><td>Only label</td></tr></table><span role="img" aria-label="synthetic-password"><svg/></span>','https://example.com/','',['synthetic-password']);
 assert.ok(r.warnings.includes('MALFORMED_TABLE_TEXT_FALLBACK'));assert.ok(!r.markdown.includes('synthetic-password'));assert.match(r.markdown,/REDACTED/);
});
