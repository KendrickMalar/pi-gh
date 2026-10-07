import {copyFile,chmod,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {fixture,draft} from './helpers.js';
export const packageRoot=fileURLToPath(new URL('../../',import.meta.url));
export async function serviceFixture(t:Parameters<typeof fixture>[0]){
 const f=await fixture(t),path=join(f.dir,'draft.json'),gh=join(f.dir,'gh'),record=join(f.dir,'record.json');
 await writeFile(path,JSON.stringify(draft()));await copyFile(join(packageRoot,'test/fake-gh.mjs'),gh);await chmod(gh,0o755);
 const keys=['PATH','FAKE_GH_RECORD','FAKE_GH_MODE'] as const,old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.PATH=f.dir+':'+process.env.PATH;process.env.FAKE_GH_RECORD=record;process.env.FAKE_GH_MODE='ok';
 t.after(async()=>{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
 let current=true;const controller=new AbortController();
 const context={cwd:f.dir,packageRoot,interactive:true,signal:controller.signal,stamp:'1',isCurrent:()=>current,confirm:async(_view:unknown)=>true};
 return {...f,draftPath:path,args:{draftPath:'draft.json',templatePath:f.path},context,controller,expire:()=>{current=false;},written:async()=>{try{return JSON.parse(await readFile(record,'utf8'));}catch{return undefined;}}};
}
