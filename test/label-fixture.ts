import {writeFile,copyFile,chmod,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {fixture} from './helpers.js';
export const label=(name:string,id=1)=>({id,node_id:'L'+id,name,color:'ffffff',description:''});
export const initial=()=>({labels:[label('old',1),label('a,b / 優先',2),label('keep',3)],issues:[{id:10,node_id:'I10',number:10,title:'Issue',state:'open',html_url:'https://github.com/example/demo/issues/10',labels:[label('old',1),label('keep',3)]}],writes:0});
export async function labelsFixture(t:Parameters<typeof fixture>[0],value:unknown=initial()){
 const f=await fixture(t);const gh=join(f.dir,'gh'),state=join(f.dir,'state.json'),record=join(f.dir,'calls.jsonl');
 await copyFile(fileURLToPath(new URL('../../test/fake-label-gh.mjs',import.meta.url)),gh);await chmod(gh,0o755);await writeFile(state,JSON.stringify(value));await writeFile(record,'');
 const env={...process.env,HOME:f.dir,PATH:f.dir+':'+process.env.PATH,LABEL_STATE:state,LABEL_RECORD:record,GH_HOST:'elsewhere.invalid'};
 const cli=fileURLToPath(new URL('./core-driver.js',import.meta.url));
 return {...f,gh,state,record,env,run:(args:string[])=>spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:20000}),write:async(value:unknown)=>{const path=join(f.dir,'change.json');await writeFile(path,JSON.stringify(value));return path;},read:async()=>JSON.parse(await readFile(state,'utf8')),calls:async()=> (await readFile(record,'utf8')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x))};
}
