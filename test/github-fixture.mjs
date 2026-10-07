import {mkdtemp,realpath,writeFile,readFile,chmod} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
export async function githubFixture(t){
 const dir=await realpath(await mkdtemp(join(tmpdir(),'pi-gh-api-'))),state=join(dir,'state.json'),log=join(dir,'log.jsonl');
 const initial={issues:{10:{id:1010,node_id:'I_10',number:10,title:'Original',body:'Body',state:'open',html_url:'https://github.com/example/demo/issues/10',updated_at:'v1'},11:{id:1011,node_id:'I_11',number:11,title:'Child',body:'Body',state:'open',html_url:'https://github.com/example/demo/issues/11',updated_at:'v1'}},subissues:[],dependencies:[],items:[],mode:''};
 await writeFile(state,JSON.stringify(initial));
 const script=`#!${process.execPath}
const fs=require('node:fs');const args=process.argv.slice(2),s=JSON.parse(fs.readFileSync(process.env.PI_GH_TEST_STATE,'utf8'));const input=fs.readFileSync(0,'utf8'),body=input?JSON.parse(input):{};const method=args[args.indexOf('--method')+1],endpoint=args.find(x=>x.startsWith('repos/'))||'graphql';fs.appendFileSync(process.env.PI_GH_TEST_LOG,JSON.stringify({args,method,endpoint,body})+'\\n');
function save(){fs.writeFileSync(process.env.PI_GH_TEST_STATE,JSON.stringify(s));}function out(v){console.log(JSON.stringify(v));}
if(s.mode==='error'){process.exit(1);}
const item={id:'PVTI_demo',content:{__typename:'Issue',id:'I_10',number:10,repository:{nameWithOwner:s.mode==='foreign'?'other/repo':'example/demo'}},fieldValues:{nodes:[]}};
const fields={nodes:[{__typename:'ProjectV2Field',id:'PVTF_text',name:'Notes',dataType:'TEXT'},{__typename:'ProjectV2Field',id:'PVTF_number',name:'Estimate',dataType:'NUMBER'},{__typename:'ProjectV2Field',id:'PVTF_date',name:'Date',dataType:'DATE'},{__typename:'ProjectV2SingleSelectField',id:'PVTSSF_status',name:'Status',dataType:'SINGLE_SELECT',options:[{id:'option_done',name:'Done'}]}],pageInfo:{hasNextPage:false,endCursor:null}};
if(endpoint==='graphql'){
 if(s.mode==='graphql-error')return out({errors:[{message:'fake failure'}]});
 if(body.query.includes('mutation')){if(body.query.includes('addProjectV2ItemById')){s.items=[item];save();return out({data:{addProjectV2ItemById:{item:{id:item.id}}}});}s.items=[{...item,fieldValues:{nodes:[{field:{id:body.variables.fieldId},text:body.variables.value.text,number:body.variables.value.number,date:body.variables.value.date,optionId:body.variables.value.singleSelectOptionId}]}}];save();return out({data:{updateProjectV2ItemFieldValue:{projectV2Item:{id:item.id}}}});}
 return out({data:{node:{__typename:'ProjectV2',id:'PVT_demo',title:'Demo',fields,items:{nodes:s.items,pageInfo:{hasNextPage:s.mode==='pages',endCursor:'next'}}}}});
}
const match=endpoint.match(/issues\\/(\\d+)/),number=match?Number(match[1]):undefined;
if(!match){return out(Object.values(s.issues));}
if(method==='GET'){
 if(endpoint.includes('sub_issues'))return out(s.subissues.map(n=>s.issues[n]));
 if(endpoint.includes('dependencies/blocked_by'))return out(s.dependencies.map(n=>s.issues[n]));
 const issue={...s.issues[number]};if(s.mode==='pr')issue.pull_request={url:'fake'};if(s.mode==='drift'){s.issues[number].updated_at+='x';save();}return out(issue);
}
if(s.mode==='write-error'){process.exit(1);}
if(endpoint.includes('sub_issues')){s.subissues=[11];save();return out(s.issues[11]);}
if(endpoint.includes('blocked_by')){s.dependencies=[11];save();return out(s.issues[11]);}
s.issues[number]={...s.issues[number],...body,updated_at:'v2'};save();out(s.issues[number]);
`;
 const gh=join(dir,'gh');await writeFile(gh,script);await chmod(gh,0o755);
 const names=['PATH','PI_GH_TEST_STATE','PI_GH_TEST_LOG','GH_HOST'];const old=Object.fromEntries(names.map(k=>[k,process.env[k]]));Object.assign(process.env,{PATH:dir+':'+process.env.PATH,PI_GH_TEST_STATE:state,PI_GH_TEST_LOG:log,GH_HOST:'wrong.example'});t.after(()=>{for(const k of names){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
 const context={cwd:dir,packageRoot:dir,interactive:true,signal:new AbortController().signal,stamp:'1',isCurrent:()=>true,confirm:async()=>true};
 return {dir,state,context,initial,async mode(mode){const v=JSON.parse(await readFile(state,'utf8'));v.mode=mode;await writeFile(state,JSON.stringify(v));},async draft(change){const path=join(dir,'change.json');await writeFile(path,JSON.stringify({version:1,repo:'example/demo',...change}));return {changePath:path};},async calls(){try{return (await readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch{return [];}},async data(){return JSON.parse(await readFile(state,'utf8'));}};
}
