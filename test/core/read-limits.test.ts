import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runGh} from '../../src/core/gh-process.js';
import {GhClient} from '../../src/core/labels-github.js';
import {GithubApi} from '../../src/github-api.js';
import {parseJson,parseGithubJson} from '../../src/core/data.js';

// A fake gh that answers every GET with a page of large items, so responses pass 1 MiB per call and in total.
// `total` items exist; each carries `size` bytes of text. per_page/page come from the endpoint.
async function fakeGh(t:{after:(fn:()=>Promise<void>)=>void},total:number,size:number){
 const dir=await mkdtemp(join(tmpdir(),'deterministic-gh-limits-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const gh=join(dir,'gh');
 await writeFile(gh,`#!/usr/bin/env node
const args=process.argv.slice(2),endpoint=args.find(a=>a.startsWith('repos/'))||'';
const q=new URLSearchParams(endpoint.split('?')[1]||''),per=Number(q.get('per_page')||100),page=Number(q.get('page')||1);
const total=${total},size=${size},items=[];
for(let i=(page-1)*per;i<Math.min(total,page*per);i++)items.push({id:i+1,node_id:'I_'+(i+1),number:i+1,name:'l'+i,body:'x'.repeat(size)});
process.stdout.write(JSON.stringify(items));
`);
 await chmod(gh,0o755);return gh;
}

test('runGh reads output above 1 MiB when no limit is given',async t=>{
 const gh=await fakeGh(t,3,1048576);
 const r=await runGh(['api','repos/example/demo/issues?per_page=3&page=1'],'',{ghExecutable:gh});
 assert.equal(r.status,'ok');assert.equal((JSON.parse(r.stdout) as unknown[]).length,3);
});

test('runGh accepts an explicit output limit above 1 MiB',async t=>{
 const gh=await fakeGh(t,2,1048576);
 const r=await runGh(['api','repos/example/demo/issues?per_page=2&page=1'],'',{ghExecutable:gh,maxOutputBytes:4*1048576});
 assert.equal(r.status,'ok');
});

test('runGh still stops at an explicit output limit',async t=>{
 const gh=await fakeGh(t,2,1048576);
 const r=await runGh(['api','repos/example/demo/issues?per_page=2&page=1'],'',{ghExecutable:gh,maxOutputBytes:1024});
 assert.equal(r.status,'unknown');
});

test('runGh rejects a non-positive output limit without starting gh',async t=>{
 const gh=await fakeGh(t,1,1);
 const r=await runGh(['api','repos/example/demo/issues'],'',{ghExecutable:gh,maxOutputBytes:0});
 assert.equal(r.status,'not-started');
});

test('label listing reads every page when the total passes 1 MiB',async t=>{
 const gh=await fakeGh(t,150,10000);
 const all=await new GhClient('example/demo',{ghExecutable:gh}).list('labels');
 assert.equal(all.length,150);
});

test('Issue listing reads every Issue when the total passes 16 MiB',async t=>{
 const gh=await fakeGh(t,300,65536);
 const all=await new GithubApi({ghExecutable:gh}).issueList('repos/example/demo/issues?state=all');
 assert.equal(all.length,300);assert.equal(new Set(all.map(v=>(v as {number:number}).number)).size,300);
});

test('REST listing reads every page when the total passes 1 MiB',async t=>{
 const gh=await fakeGh(t,150,10000);
 const all=await new GithubApi({ghExecutable:gh}).restList('repos/example/demo/labels');
 assert.equal(all.length,150);
});

const big=()=>Buffer.from(JSON.stringify({body:'x'.repeat(1048576)}));
test('local input JSON keeps the 1 MiB limit',()=>{
 assert.throws(()=>parseJson(big()),(e:unknown)=>(e as {code?:string}).code==='INPUT_LIMIT');
});
test('GitHub response JSON has no size limit',()=>{
 assert.equal((parseGithubJson(big()) as {body:string}).body.length,1048576);
});
