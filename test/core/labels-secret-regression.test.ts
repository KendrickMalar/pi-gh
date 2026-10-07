import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {labelsFixture,initial,label} from '../label-fixture.js';
import {draft} from '../helpers.js';
const base={version:1,repo:'example/demo'};
const credential='password="abcdefghi"';
for(const location of ['change','remote-description','remote-name','issue-remote-description','issue-remote-name','decoded-unicode-input'])test('decoded secret guard blocks '+location,async t=>{
 const s=initial();
 if(location.includes('description'))s.labels[0]!.description=credential;
 if(location.includes('name')){s.labels[0]!.name=credential;s.issues[0]!.labels[0]!.name=credential;}
 const f=await labelsFixture(t,s);
 const issue=location.startsWith('issue-');
 const value=issue?{...draft(),labels:[location.includes('name')?credential:'old']}:
 location==='change'||location==='decoded-unicode-input'?{...base,operation:'label-create',name:'new',color:'ffffff',description:credential}:
 {...base,operation:'label-delete',name:location.includes('name')?credential:'old'};
 const path=await f.write(value);
 if(location==='decoded-unicode-input'){const bytes=await readFile(path,'utf8');await writeFile(path,bytes.replace('password','pass\\u0077ord').replace('abcdefghi','\\u0061bcdefghi'));}
 const args=issue?[path,'--template',f.path]:[path];
 const p=f.run(issue?['preview',...args,'--json']:['labels','preview',...args,'--json']);
 assert.equal(p.status,0,p.stderr);
 const preview=JSON.parse(p.stdout);
 assert.equal(preview.sensitive,true);
 assert.ok(!p.stdout.includes('abcdefghi')&&!p.stdout.includes('bcdefghi'),'secret must not be displayed');
 const result=f.run(issue?['submit',...args,'--approved-digest',preview.digest]:['labels','apply',...args,'--approved-digest',preview.digest]);
 assert.equal(result.status,2,result.stderr);assert.ok(!result.stderr.includes('abcdefghi'));
 assert.equal((await f.read()).writes,0);
 assert.ok((await f.calls()).every(c=>c.args[c.args.indexOf('--method')+1]==='GET'));
});
test('decoded sensitive change refuses apply before reading GitHub',async t=>{
 const f=await labelsFixture(t);const path=await f.write({...base,operation:'label-create',name:'new',color:'ffffff',description:credential});
 const r=f.run(['labels','apply',path,'--approved-digest','a'.repeat(64)]);assert.equal(r.status,2);assert.equal((await f.calls()).length,0);assert.equal((await f.read()).writes,0);
});
