import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture} from '../helpers.js';
const cli = fileURLToPath(new URL('../core-driver.js', import.meta.url));
async function check(t: Parameters<typeof fixture>[0], value: unknown) {
 const f = await fixture(t); const path = join(f.dir,'change.json'); await writeFile(path,JSON.stringify(value));
 return spawnSync(process.execPath,[cli,'labels','validate',path],{encoding:'utf8',env:{...process.env,PATH:''}});
}
const base = {version:1,repo:'example/demo'};
for(const change of [
 {...base,operation:'issue-labels',issue:12,add:['a,b','優先'],remove:['old']},
 {...base,operation:'label-create',name:'a,b',color:'aabbcc',description:''},
 {...base,operation:'label-edit',name:'old',newName:'new',description:''},
 {...base,operation:'label-delete',name:'old'},
]) test('offline validates '+change.operation,async t=>{const r=await check(t,change);assert.equal(r.status,0,r.stderr)});
for(const value of [
 {...base,operation:'label-create',name:'',color:'ffffff'},
 {...base,operation:'label-create',name:'x',color:'bad'},
 {...base,operation:'label-edit',name:'x'},
 {...base,operation:'issue-labels',issue:1,add:['x'],remove:['x']},
 {...base,operation:'issue-labels',issue:1,add:['X','x']},
 {...base,operation:'issue-labels',issue:0,add:['x']},
 {...base,operation:'label-delete',name:'x',force:true},
 {...base,operation:'label-delete',name:'x\n'},
]) test('rejects malformed change '+JSON.stringify(value),async t=>{assert.equal((await check(t,value)).status,2)});
