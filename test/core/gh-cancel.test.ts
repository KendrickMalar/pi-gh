import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runGh,type GhOptions} from '../../src/core/gh-process.js';
// Removing either initial signal or spawn gate check must produce an observable owned child.
async function probe(){const dir=await mkdtemp(join(tmpdir(),'pi-gh-process-'));const file=join(dir,'probe.mjs'),mark=join(dir,'spawned');await writeFile(file,'import fs from "node:fs";fs.writeFileSync(process.argv[2],"started");process.stdout.write("ready\\n");if(process.argv[3]==="retain"){const {spawn}=await import("node:child_process");spawn(process.execPath,["-e","setTimeout(()=>{},30000)"],{stdio:["ignore",1,2]});}else setTimeout(()=>{},30000);');return {file,mark};}
async function exists(path:string){try{await readFile(path);return true;}catch{return false;}}
test('initial abort spawns no owned process',async()=>{const p=await probe(),controller=new AbortController();controller.abort();const result=await runGh([p.file,p.mark],'',{ghExecutable:process.execPath,timeoutMs:150,signal:controller.signal} as GhOptions);assert.equal(result.status,'not-started');assert.equal(await exists(p.mark),false);});
test('final start gate false and thrown gate spawn no process',async()=>{for(const gate of [()=>false,()=>{throw new Error('expired');}]){const p=await probe();const result=await runGh([p.file,p.mark],'',{ghExecutable:process.execPath,timeoutMs:150,beforeStart:gate} as GhOptions);assert.equal(result.status,'not-started');assert.equal(await exists(p.mark),false);}});
test('abort after start returns unknown and does not wait full timeout',async()=>{const p=await probe(),controller=new AbortController(),start=Date.now();const pending=runGh([p.file,p.mark],'',{ghExecutable:process.execPath,timeoutMs:5000,signal:controller.signal} as GhOptions);for(let i=0;i<100&&!await exists(p.mark);i++)await new Promise(r=>setTimeout(r,10));assert.equal(await exists(p.mark),true);controller.abort();assert.equal((await pending).status,'unknown');assert.ok(Date.now()-start<2000);});
test('timeout bounds exited parent with retained pipe',async()=>{const p=await probe(),start=Date.now();const r=await runGh([p.file,p.mark,'retain'],'',{ghExecutable:process.execPath,timeoutMs:200});assert.equal(r.status,'unknown');assert.ok(Date.now()-start<1500);});
