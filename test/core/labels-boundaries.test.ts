import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {labelsFixture,initial} from '../label-fixture.js';
import {runGh} from '../../src/core/gh-process.js';
import {previewLabelChange} from '../../src/core/labels-approval.js';
import {input,draft} from '../helpers.js';
const base={version:1,repo:'example/demo'};
test('repository replacement invalidates label creation approval',async t=>{
 const f=await labelsFixture(t);const path=await f.write({...base,operation:'label-create',name:'new',color:'ffffff'});
 const p=f.run(['labels','preview',path,'--json']);assert.equal(p.status,0,p.stderr);
 const s=await f.read();s.repository={id:999,node_id:'R999',full_name:'example/demo',html_url:'https://github.com/example/demo'};await writeFile(f.state,JSON.stringify(s));
 const r=f.run(['labels','apply',path,'--approved-digest',JSON.parse(p.stdout).digest]);assert.equal(r.status,2,r.stderr);assert.equal((await f.read()).writes,0);
});
test('repository transfer redirect cannot authorize a different repository',async t=>{
 const f=await labelsFixture(t,{...initial(),repository:{id:77,node_id:'R77',full_name:'other/demo',html_url:'https://github.com/other/demo'}});
 const path=await f.write({...base,operation:'label-delete',name:'old'});assert.notEqual(f.run(['labels','preview',path,'--json']).status,0);assert.equal((await f.read()).writes,0);
});
test('labelled Issue creation binds repository identity',async t=>{
 const f=await labelsFixture(t);const path=await f.write({...draft(),labels:['keep']});const args=[path,'--template',f.path];
 const p=f.run(['preview',...args,'--json']);assert.equal(p.status,0,p.stderr);
 const s=await f.read();s.repository={id:999,node_id:'R999',full_name:'example/demo',html_url:'https://github.com/example/demo'};await writeFile(f.state,JSON.stringify(s));
 const r=f.run(['submit',...args,'--approved-digest',JSON.parse(p.stdout).digest]);assert.equal(r.status,2,r.stderr);assert.equal((await f.read()).writes,0);
});
for(const name of ['.','..'])test('rejects path-normalizing label name '+name,async t=>{
 const f=await labelsFixture(t);const path=await f.write({...base,operation:'label-delete',name});assert.equal(f.run(['labels','validate',path]).status,2);
});
for(const mode of ['wait','retained','huge'])test('bounded gh '+mode+' terminates without hang',async t=>{
 const f=await labelsFixture(t,{...initial(),mode});const start=Date.now();
 const r=await runGh(['api','--hostname=github.com','--method','GET','repos/example/demo/labels'],'',{ghExecutable:f.gh,env:f.env,timeoutMs:300,maxOutputBytes:1024});
 assert.equal(r.status,'unknown');assert.ok(Date.now()-start<2000);
});
test('incomplete aggregate listing cannot produce an approval',async t=>{
 const f=await labelsFixture(t,{...initial(),mode:'endless'});
 await assert.rejects(previewLabelChange(input({...base,operation:'label-create',name:'new',color:'ffffff'}),{ghExecutable:f.gh,env:f.env}),/listing|Incomplete|exceeds/);
 assert.equal((await f.read()).writes,0);
});
