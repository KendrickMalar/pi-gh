import test from 'node:test';
import assert from 'node:assert/strict';
import {labelsFixture,initial} from '../label-fixture.js';
const base={version:1,repo:'example/demo'};
const many=(n:number,offset=0)=>Array.from({length:n},(_,i)=>({name:'Wave: '+(i+1+offset),color:'0e8a16',description:'Wave '+(i+1+offset)}));
const change=(labels:unknown)=>({...base,operation:'label-create-many',labels});
const posts=async(f:{calls:()=>Promise<{args:string[]}[]>})=>(await f.calls()).filter(c=>c.args[c.args.indexOf('--method')+1]==='POST').length;
const gets=async(f:{calls:()=>Promise<{args:string[]}[]>})=>(await f.calls()).filter(c=>c.args[c.args.indexOf('--method')+1]==='GET').length;

test('label-create-many creates every label with one listing before and after the writes',async t=>{
 const f=await labelsFixture(t);const path=await f.write(change(many(30)));
 const p=f.run(['labels','preview',path,'--json']);assert.equal(p.status,0,p.stderr);const preview=JSON.parse(p.stdout);
 assert.equal(preview.operation,'label-create-many');assert.deepEqual(preview.before,[]);assert.equal(preview.after.length,30);assert.equal(preview.noop,false);
 const before=await gets(f);
 const r=f.run(['labels','apply',path,'--approved-digest',preview.digest]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'applied');
 const s=await f.read();assert.equal(s.writes,30);for(const l of many(30))assert.ok(s.labels.some((x:{name:string;color:string;description:string})=>x.name===l.name&&x.color===l.color&&x.description===l.description),l.name);
 assert.equal(await posts(f),30);
 assert.ok((await gets(f))-before<=4,'apply re-reads the repository and its labels once before and once after, not per label');
});
test('label-create-many refuses any label that already exists, before writing',async t=>{
 const f=await labelsFixture(t);const path=await f.write(change([...many(2),{name:'OLD',color:'ffffff'}]));
 assert.notEqual(f.run(['labels','preview',path,'--json']).status,0);assert.equal(await posts(f),0);
});
test('label-create-many input is strict: 1..100 unique labels with valid fields',async t=>{
 const f=await labelsFixture(t);
 for(const labels of [[],many(101),[...many(1),{name:'wave: 1',color:'ffffff'}],[{name:'x',color:'bad'}],[{name:'x',color:'ffffff',extra:1}],[{name:'',color:'ffffff'}],'nope']){
  const path=await f.write(change(labels));assert.notEqual(f.run(['labels','preview',path,'--json']).status,0,JSON.stringify(labels).slice(0,60));
 }
 const ok=await f.write(change(many(100)));assert.equal(f.run(['labels','preview',ok,'--json']).status,0);
 assert.equal(await posts(f),0);
});
test('a definite failure in the middle stops at once and reports unknown (earlier labels exist)',async t=>{
 const s=initial() as ReturnType<typeof initial>&{failPostAt?:number};s.failPostAt=3;const f=await labelsFixture(t,s);const path=await f.write(change(many(5)));
 const p=JSON.parse(f.run(['labels','preview',path,'--json']).stdout);
 const r=f.run(['labels','apply',path,'--approved-digest',p.digest]);assert.equal(r.status,3,r.stderr);assert.equal(JSON.parse(r.stderr).status,'unknown');
 assert.equal(await posts(f),3,'no write after the failing one');assert.equal((await f.read()).writes,2);
});
test('a failure on the very first write is unknown (a gh error may still have applied it), with nothing sent after it',async t=>{
 const s=initial() as ReturnType<typeof initial>&{failPostAt?:number};s.failPostAt=1;const f=await labelsFixture(t,s);const path=await f.write(change(many(3)));
 const p=JSON.parse(f.run(['labels','preview',path,'--json']).stdout);
 const r=f.run(['labels','apply',path,'--approved-digest',p.digest]);assert.equal(r.status,3,r.stderr);assert.equal(JSON.parse(r.stderr).status,'unknown');assert.equal(await posts(f),1);
});
test('a label created by someone else after approval stops the whole batch before any write',async t=>{
 const f=await labelsFixture(t);const path=await f.write(change(many(3)));const p=JSON.parse(f.run(['labels','preview',path,'--json']).stdout);
 const s=await f.read();s.labels.push({id:50,node_id:'L50',name:'Wave: 2',color:'ffffff',description:''});const {writeFile}=await import('node:fs/promises');await writeFile(f.state,JSON.stringify(s));
 const r=f.run(['labels','apply',path,'--approved-digest',p.digest]);assert.notEqual(JSON.parse(r.stdout||'{}').status,'applied');assert.equal(await posts(f),0);
});
