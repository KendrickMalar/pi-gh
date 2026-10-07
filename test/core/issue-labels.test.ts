import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {labelsFixture} from '../label-fixture.js';
import {draft} from '../helpers.js';
test('labelled Issue preview and submit use exact JSON labels and confirmed Issue',async t=>{
 const f=await labelsFixture(t);const path=await f.write({...draft(),labels:['a,b / 優先','keep']});const args=[path,'--template',f.path];
 const p=f.run(['preview',...args,'--json']);assert.equal(p.status,0,p.stderr);const preview=JSON.parse(p.stdout);assert.deepEqual(preview.labels,['a,b / 優先','keep']);
 const r=f.run(['submit',...args,'--approved-digest',preview.digest]);assert.equal(r.status,0,r.stderr);
 const s=await f.read();assert.equal(s.writes,1);const i=s.issues.find((i:{number:number})=>i.number===123);assert.ok(i.body.includes('検索を追加'));assert.deepEqual(i.labels.map((l:{name:string})=>l.name),['a,b / 優先','keep']);
 const post=(await f.calls()).filter(c=>c.args[c.args.indexOf('--method')+1]==='POST');assert.equal(post.length,1);assert.deepEqual(JSON.parse(post[0].body).labels,['a,b / 優先','keep']);
});
test('labelled Issue refuses missing label before creation',async t=>{
 const f=await labelsFixture(t);const path=await f.write({...draft(),labels:['missing']});const args=[path,'--template',f.path];const p=f.run(['preview',...args,'--json']);assert.equal(p.status,2,p.stderr);assert.equal((await f.read()).writes,0);
});
test('labelled Issue rejects replacement identity after preview',async t=>{
 const f=await labelsFixture(t);const path=await f.write({...draft(),labels:['keep']});const args=[path,'--template',f.path];const p=f.run(['preview',...args,'--json']);assert.equal(p.status,0,p.stderr);
 const s=await f.read();s.labels[2].id=999;s.labels[2].node_id='L999';await writeFile(f.state,JSON.stringify(s));
 const r=f.run(['submit',...args,'--approved-digest',JSON.parse(p.stdout).digest]);assert.equal(r.status,2,r.stderr);assert.equal((await f.read()).writes,0);
});
test('labelled Issue verification failure is uncertain and not retried',async t=>{
 const f=await labelsFixture(t,{labels:(await import('../label-fixture.js')).initial().labels,issues:[],writes:0,failReadsAfterWrite:true});const path=await f.write({...draft(),labels:['keep']});const args=[path,'--template',f.path];const p=f.run(['preview',...args,'--json']);assert.equal(p.status,0,p.stderr);
 const r=f.run(['submit',...args,'--approved-digest',JSON.parse(p.stdout).digest]);assert.equal(r.status,3,r.stderr);assert.equal((await f.read()).writes,1);
});
test('labels CLI rejects extra flags and requires approval',async t=>{
 const f=await labelsFixture(t);const path=await f.write({version:1,repo:'example/demo',operation:'label-delete',name:'old'});
 for(const args of [['labels','apply',path],['labels','preview',path,'--json','--json'],['labels','apply',path,'--approved-digest','a'.repeat(64),'--force']])assert.equal(f.run(args).status,2);
 assert.equal((await f.calls()).length,0);
});
