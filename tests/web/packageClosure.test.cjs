'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
test('READ image copies the transitive capture dependencies shared by control and MCP',()=>{
 const dockerfile=fs.readFileSync(path.join(root,'deploy/web/Dockerfile'),'utf8');
 const copy=dockerfile.split('\n').filter(line=>line.startsWith('COPY lib/capture/')).join(' ');
 const supplied=new Set((copy.match(/lib\/capture\/[\w]+\.js/g)||[]).map(p=>path.resolve(root,p)));
 const visited=new Set();
 function walk(file){
  if(visited.has(file))return;visited.add(file);
  assert.ok(supplied.has(file),`Missing image source: ${path.relative(root,file)}`);
  const source=fs.readFileSync(file,'utf8');
  for(const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){
   const dependency=path.resolve(path.dirname(file),match[1]+(path.extname(match[1])?'':'.js'));
   if(dependency.startsWith(path.join(root,'lib/capture')+path.sep))walk(dependency);
  }
 }
 for(const file of supplied)walk(file);
 assert.ok(visited.has(path.join(root,'lib/capture/resourceScope.js')));
});
