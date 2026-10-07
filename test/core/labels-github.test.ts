import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {labelsFixture,initial,label} from '../label-fixture.js';
const base={version:1,repo:'example/demo'};
test('preview captures exact comma label and Issue delta without writes',async t=>{
 const f=await labelsFixture(t);const path=await f.write({...base,operation:'issue-labels',issue:10,add:['a,b / 優先'],remove:['old']});
 const r=f.run(['labels','preview',path,'--json']);assert.equal(r.status,0,r.stderr);
 const p=JSON.parse(r.stdout);assert.deepEqual(p.after.map((x:{name:string})=>x.name),['a,b / 優先','keep']);assert.equal((await f.read()).writes,0);
 const calls=await f.calls();assert.ok(calls.length>=2);assert.ok(calls.every(c=>c.host==='github.com'&&c.args[1]==='--hostname=github.com'));
});
test('label preview paginates all labels',async t=>{
 const s=initial();s.labels=Array.from({length:101},(_,i)=>label('l'+i,i+1));const f=await labelsFixture(t,s);
 const path=await f.write({...base,operation:'label-edit',name:'l100',description:'new'});
 const r=f.run(['labels','preview',path,'--json']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).before.name,'l100');assert.ok((await f.calls()).some(c=>c.args.some((a:string)=>a.includes('page=2'))));
});
test('read failure refuses preview without mutation',async t=>{
 const f=await labelsFixture(t,{...initial(),mode:'read-error'});const path=await f.write({...base,operation:'label-delete',name:'old'});
 assert.notEqual(f.run(['labels','preview',path,'--json']).status,0);assert.equal((await f.read()).writes,0);
});
test('deletion preview includes closed Issues and PRs',async t=>{
 const s=initial();s.issues.push({...s.issues[0]!,id:11,node_id:'I11',number:11,state:'closed',html_url:'https://github.com/example/demo/pull/11',pull_request:{url:'https://api.github.com/repos/example/demo/pulls/11'}} as typeof s.issues[number]);
 const f=await labelsFixture(t,s);const path=await f.write({...base,operation:'label-delete',name:'old'});
 const r=f.run(['labels','preview',path,'--json']);assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout).affected.map((x:{number:number})=>x.number),[10,11]);
});
test('missing labels and PR targets are rejected',async t=>{
 const s=initial();const f=await labelsFixture(t,s);
 for(const c of [{...base,operation:'issue-labels',issue:10,add:['absent']},{...base,operation:'label-edit',name:'absent',description:'x'},{...base,operation:'label-create',name:'old',color:'123abc'}]){const path=await f.write(c);assert.notEqual(f.run(['labels','preview',path,'--json']).status,0)}
 await writeFile(f.state,JSON.stringify({...s,issues:[{...s.issues[0],pull_request:{url:'x'}}]}));
 const path=await f.write({...base,operation:'issue-labels',issue:10,add:['keep']});assert.notEqual(f.run(['labels','preview',path,'--json']).status,0);
 assert.equal((await f.read()).writes,0);
});
