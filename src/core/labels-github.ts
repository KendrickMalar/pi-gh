import {fail,record,nonblank,parseJson} from './data.js';
import {runGh,type GhOptions,type GhResult} from './gh-process.js';
import {labelKey,validateLabelName,validateRepo,type LabelChange} from './labels-input.js';
export type Label={id:number;node_id:string;name:string;color:string;description:string};
export type Affected={id:number;node_id:string;number:number;url:string;kind:'issue'|'pull-request'};
export type Repository={id:number;node_id:string;full_name:string};
export async function repositoryIdentity(client:GhClient):Promise<Repository>{
 const value=await client.read('');
 if(!record(value)||!Number.isSafeInteger(value.id)||(value.id as number)<1||!nonblank(value.node_id)||typeof value.full_name!=='string'||value.full_name.toLowerCase()!==client.repo.toLowerCase()||typeof value.html_url!=='string'||value.html_url.toLowerCase()!==('https://github.com/'+client.repo).toLowerCase())fail('GITHUB_REPOSITORY','','Cannot confirm the requested repository identity.');
 return {id:value.id as number,node_id:value.node_id,full_name:value.full_name};
}
export type LabelState={repository:Repository;repo:string;operation:LabelChange['operation'];issue?:Affected;before:Label|Label[]|null;after:Label|Label[]|null;affected:Affected[]};
export class GhClient{
 private readonly expires=Date.now()+60000;
 constructor(readonly repo:string,private readonly options:GhOptions={}){validateRepo(repo)}
 endpoint(suffix:string){return 'repos/'+this.repo+(suffix?'/'+suffix:'')}
 async request(method:'GET'|'POST'|'PATCH'|'DELETE',suffix:string,payload?:unknown):Promise<GhResult>{
 const remaining=Math.min(this.options.timeoutMs??60000,this.expires-Date.now());
 if(remaining<=0)return {status:'not-started',stdout:''};
 const args=['api','--hostname=github.com','--method',method,this.endpoint(suffix),'-H','Accept: application/vnd.github+json','-H','X-GitHub-Api-Version: 2022-11-28',...(payload===undefined?[]:['--input','-'])];
 return runGh(args,payload===undefined?'':JSON.stringify(payload),{...this.options,timeoutMs:remaining});
 }
 async read(suffix:string):Promise<unknown>{
 const r=await this.request('GET',suffix);
 if(r.status!=='ok')fail('GITHUB_READ','','Cannot confirm GitHub state. No changes performed.');
 try{return parseJson(Buffer.from(r.stdout))}catch{fail('GITHUB_RESPONSE','','Invalid GitHub response.')}
 }
 async list(suffix:string):Promise<unknown[]>{
 const result:unknown[]=[];let bytes=0;
 for(let page=1;page<=100;page++){
 const value=await this.read(suffix+(suffix.includes('?')?'&':'?')+'per_page=100&page='+page);
 if(!Array.isArray(value)||value.length>100)fail('GITHUB_RESPONSE','','Expected a paginated array.');
 bytes+=Buffer.byteLength(JSON.stringify(value));
 if(bytes>1048576)fail('GITHUB_LIMIT','','Complete listing exceeds 1 MiB. Narrow the repository or inspect manually.');
 result.push(...value);if(value.length<100)return result;
 }
 fail('GITHUB_LIMIT','','Incomplete listing: more than 100 pages.');
 }
}
export function parseLabel(v:unknown):Label{
 if(!record(v)||!Number.isSafeInteger(v.id)||(v.id as number)<1||!nonblank(v.node_id)||typeof v.color!=='string'||! /^[a-fA-F0-9]{6}$/.test(v.color)||(v.description!==null&&typeof v.description!=='string'))fail('GITHUB_RESPONSE','','Invalid label.');
 validateLabelName(v.name);
 return {id:v.id as number,node_id:v.node_id,name:v.name,color:v.color.toLowerCase(),description:v.description as string??''};
}
export const sortLabels=(labels:Label[])=>labels.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:a.id-b.id);
export async function repositoryLabels(client:GhClient):Promise<Label[]>{
 const labels=(await client.list('labels')).map(parseLabel);
 if(new Set(labels.map(l=>labelKey(l.name))).size!==labels.length||new Set(labels.map(l=>l.id)).size!==labels.length)fail('GITHUB_RESPONSE','','Duplicate labels in listing.');
 return sortLabels(labels);
}
export function requireLabels(all:Label[],names:string[]):Label[]{
 return sortLabels(names.map(n=>{const l=all.find(x=>labelKey(x.name)===labelKey(n));if(!l)fail('LABEL_MISSING','','Requested label does not exist. Create it separately.');return l}));
}
export function parseIssue(v:unknown,repo:string):{identity:Affected;labels:Label[]}{
 if(!record(v)||!Number.isSafeInteger(v.id)||(v.id as number)<1||!nonblank(v.node_id)||!Number.isSafeInteger(v.number)||(v.number as number)<1||!Array.isArray(v.labels)||typeof v.html_url!=='string')fail('GITHUB_RESPONSE','','Invalid Issue response.');
 const kind=v.pull_request===undefined?'issue':'pull-request';
 const expected='https://github.com/'+repo+'/'+(kind==='issue'?'issues':'pull')+'/'+v.number;
 if(v.html_url.toLowerCase()!==expected.toLowerCase())fail('GITHUB_RESPONSE','','Unexpected Issue URL.');
 const labels=v.labels.map(parseLabel);
 if(new Set(labels.map(l=>l.id)).size!==labels.length||new Set(labels.map(l=>labelKey(l.name))).size!==labels.length)fail('GITHUB_RESPONSE','','Duplicate Issue labels.');
 return {identity:{id:v.id as number,node_id:v.node_id,number:v.number as number,url:v.html_url,kind},labels:sortLabels(labels)};
}
export async function readIssue(client:GhClient,number:number){
 const issue=parseIssue(await client.read('issues/'+number),client.repo);
 if(issue.identity.number!==number||issue.identity.kind!=='issue')fail('LABEL_ISSUE','','Target must be an Issue, not a pull request.');
 return issue;
}
export async function captureLabelState(change:LabelChange,client:GhClient):Promise<LabelState>{
 const repository=await repositoryIdentity(client);
 const all=await repositoryLabels(client);
 if(change.operation==='issue-labels'){
 const issue=await readIssue(client,change.issue);
 const add=requireLabels(all,change.add??[]),remove=requireLabels(all,change.remove??[]);
 const after=sortLabels([...issue.labels.filter(l=>!remove.some(r=>r.id===l.id)),...add.filter(l=>!issue.labels.some(x=>x.id===l.id))]);
 return {repository,repo:change.repo,operation:change.operation,issue:issue.identity,before:issue.labels,after,affected:[]};
 }
 const before=all.find(l=>labelKey(l.name)===labelKey(change.name))??null;
 if(change.operation==='label-create'){
 if(before)fail('LABEL_EXISTS','','Label already exists; use an explicit edit.');
 return {repository,repo:change.repo,operation:change.operation,before:null,after:{id:0,node_id:'',name:change.name,color:change.color.toLowerCase(),description:change.description??''},affected:[]};
 }
 if(!before)fail('LABEL_MISSING','','Requested label does not exist.');
 if(change.operation==='label-edit'&&change.newName&&all.some(l=>labelKey(l.name)===labelKey(change.newName!)&&l.id!==before.id))fail('LABEL_EXISTS','','New name collides with an existing label.');
 const affected=(await client.list('issues?state=all&sort=created&direction=asc')).map(v=>parseIssue(v,change.repo)).filter(i=>i.labels.some(l=>l.id===before.id)).map(i=>i.identity).sort((a,b)=>a.number-b.number);
 if(new Set(affected.map(i=>i.id)).size!==affected.length)fail('GITHUB_RESPONSE','','Duplicate Issues in impact listing.');
 const after=change.operation==='label-delete'?null:{...before,name:change.newName??before.name,color:change.color?.toLowerCase()??before.color,description:change.description??before.description};
 return {repository,repo:change.repo,operation:change.operation,before,after,affected};
}
