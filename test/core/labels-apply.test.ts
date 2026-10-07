import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {labelsFixture,initial,label} from '../label-fixture.js';
const base={version:1,repo:'example/demo'};
const changes=[
 {...base,operation:'issue-labels',issue:10,add:['a,b / 優先'],remove:['old']},
 {...base,operation:'label-create',name:'new / ラベル,a',color:'abc123',description:'new description'},
 {...base,operation:'label-edit',name:'old',newName:'new / 名前,a',color:'abc123',description:''},
 {...base,operation:'label-delete',name:'old'}
];
for(const change of changes)test('approved '+change.operation+' mutates and verifies once',async t=>{
 const f=await labelsFixture(t);const path=await f.write(change);const preview=f.run(['labels','preview',path,'--json']);assert.equal(preview.status,0,preview.stderr);
 const r=f.run(['labels','apply',path,'--approved-digest',JSON.parse(preview.stdout).digest]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'applied');
 const s=await f.read();assert.equal(s.writes,1);
 if(change.operation==='issue-labels')assert.deepEqual(s.issues[0].labels.map((l:{name:string})=>l.name),['a,b / 優先','keep']);
 if(change.operation==='label-create')assert.ok(s.labels.some((l:{name:string;color:string})=>l.name==='new / ラベル,a'&&l.color==='abc123'));
 if(change.operation==='label-edit')assert.equal(s.issues[0].labels[0].name,'new / 名前,a');
 if(change.operation==='label-delete')assert.deepEqual(s.issues[0].labels.map((l:{name:string})=>l.name),['keep']);
 const writes=(await f.calls()).filter(c=>c.args[c.args.indexOf('--method')+1]!=='GET');assert.equal(writes.length,1);assert.ok(writes[0].args.every((a:string)=>!a.includes('--force')));
});
test('no-op preserves labels and performs no write',async t=>{
 const f=await labelsFixture(t);const path=await f.write({...base,operation:'issue-labels',issue:10,add:['keep'],remove:['a,b / 優先']});
 const p=JSON.parse(f.run(['labels','preview',path,'--json']).stdout);assert.equal(p.noop,true);
 const r=f.run(['labels','apply',path,'--approved-digest',p.digest]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'noop');assert.equal((await f.read()).writes,0);
});
for(const drift of ['input','label','issue','impact','identity'])test('approval refuses '+drift+' drift',async t=>{
 const f=await labelsFixture(t);const path=await f.write(drift==='issue'?changes[0]:changes[3]);const p=JSON.parse(f.run(['labels','preview',path,'--json']).stdout);
 if(drift==='input')await writeFile(path,(await readFile(path,'utf8'))+' ');
 else {const s=await f.read();if(drift==='label')s.labels[0].color='123456';if(drift==='identity')s.labels[0].node_id='replacement';if(drift==='issue')s.issues[0].labels=[label('old',1)];if(drift==='impact')s.issues.push({...s.issues[0],id:22,node_id:'I22',number:22,html_url:'https://github.com/example/demo/issues/22'});await writeFile(f.state,JSON.stringify(s));}
 const r=f.run(['labels','apply',path,'--approved-digest',p.digest]);assert.equal(r.status,2,r.stderr);assert.equal((await f.read()).writes,0);
});
test('bad approval performs no network operation',async t=>{
 const f=await labelsFixture(t);const path=await f.write(changes[3]);const r=f.run(['labels','apply',path,'--approved-digest','bad']);assert.equal(r.status,2);assert.equal((await f.calls()).length,0);
});
test('secret in change or remote metadata is masked and prevents changes',async t=>{
 for(const remote of [false,true]){
 const s=initial();if(remote)s.labels[0]!.description='password=abcdefghi';const f=await labelsFixture(t,s);
 const path=await f.write(remote?changes[3]:{...base,operation:'label-create',name:'safe',color:'abcdef',description:'password=abcdefghi'});
 const r=f.run(['labels','preview',path,'--json']);assert.equal(r.status,0,r.stderr);assert.ok(!r.stdout.includes('abcdefghi'));const p=JSON.parse(r.stdout);assert.equal(p.sensitive,true);
 const a=f.run(['labels','apply',path,'--approved-digest',p.digest]);assert.equal(a.status,2);assert.equal((await f.read()).writes,0);
 }
});
for(const mode of ['write-error','verify-error'])test(mode+' stays uncertain without retry',async t=>{
 const f=await labelsFixture(t,{...initial(),...(mode==='write-error'?{mode}:{failReadsAfterWrite:true})});const path=await f.write(changes[3]);const p=JSON.parse(f.run(['labels','preview',path,'--json']).stdout);
 const r=f.run(['labels','apply',path,'--approved-digest',p.digest]);assert.equal(r.status,3,r.stderr);assert.equal(JSON.parse(r.stderr).status,'unknown');assert.equal((await f.read()).writes,1);
});
