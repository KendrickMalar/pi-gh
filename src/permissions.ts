import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {fail,keys,record,parseJson} from './core/data.js';
import {validateRepo} from './core/labels-input.js';

export type AgentApprovalEntry={operation:string;repo:string;projectId?:string;digest:string};
/** `agentApproves`: an agentApproval grant lets the agent itself approve any allowed write of its repos (never a forbidden one); each such approval is logged with `recordAgentApproval` first. */
export type PermissionLease={allows:(operation:string,repo:string,projectId?:string)=>boolean;isCurrent:()=>Promise<boolean>;agentApproves?:(operation:string,repo:string,projectId?:string)=>boolean;recordAgentApproval?:(entry:AgentApprovalEntry)=>Promise<void>};
export type Actor={child:boolean;headless:boolean};
const allowed=new Set(['gh_repo_create','gh_issue_edit_if_current','gh_issue_labels_if_current','gh_issue_close_if_current','gh_issue_submit','gh_label_create','gh_label_edit','gh_issue_labels','gh_issue_edit','gh_issue_close','gh_subissue_add','gh_dependency_add','gh_project_add_issue','gh_project_field_update','gh_project_create']);
type Grant={repo:string;operations:string[];allowChild:boolean;allowHeadless:boolean;projectIds:string[];agentApproval:boolean};
/** A grant names one exact OWNER/REPO, or OWNER/* for every repository of exactly that owner. No other wildcard exists. */
function validateGrantRepo(value:unknown):asserts value is string{
 if(typeof value==='string'&&value.endsWith('/*')){validateRepo(value.slice(0,-1)+'x');return;}
 validateRepo(value);
}
function grantCovers(grantRepo:string,repo:string){
 const g=grantRepo.toLowerCase(),r=repo.toLowerCase();
 return g.endsWith('/*')?r.split('/')[0]===g.slice(0,-2):g===r;
}
export function permissionPath(){return join(homedir(),'.pi','agent','pi-gh-permissions.json');}
async function capture(path:string):Promise<string|undefined>{
 const absolute=resolve(path);let parent=dirname(absolute);
 try{const named=await lstat(absolute);if(!named.isFile()||named.size>65536||(named.mode&0o077)!==0||(process.getuid&&named.uid!==process.getuid()))fail('PERMISSION_FILE','','Use an owner-only regular permission file.');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
 while(true){const s=await lstat(parent);if(!s.isDirectory()||s.isSymbolicLink())fail('PERMISSION_FILE','','Permission parents must be real directories.');const next=dirname(parent);if(next===parent)break;parent=next;}
 let handle;
 try{handle=await open(absolute,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
 try{
  const s=await handle.stat();if(!s.isFile()||s.size>65536||(s.mode&0o077)!==0||(process.getuid&&s.uid!==process.getuid()))fail('PERMISSION_FILE','','Use an owner-only regular permission file.');
  const buffer=Buffer.alloc(65537);let used=0;
  while(used<buffer.length){const read=await handle.read(buffer,used,buffer.length-used,used);if(read.bytesRead===0)break;used+=read.bytesRead;}
  if(used>65536)fail('PERMISSION_FILE','','Permission file exceeds limit.');
  const bytes=buffer.subarray(0,used),after=await handle.stat(),named=await lstat(absolute);
  if(named.isSymbolicLink()||s.ino!==named.ino||s.dev!==named.dev||s.size!==after.size||s.size!==used||s.mode!==after.mode||s.uid!==after.uid||s.mode!==named.mode||s.mtimeMs!==after.mtimeMs)fail('PERMISSION_FILE','','Permission file changed while reading.');
  return JSON.stringify({inode:s.ino,device:s.dev,mode:s.mode,bytes:bytes.toString('base64')});
 }finally{await handle.close();}
}
/** Appends one JSON line (owner-only file, never through a symlink). A write is not made when this fails. */
async function appendAgentApproval(log:string,entry:AgentApprovalEntry){
 const handle=await open(log,constants.O_WRONLY|constants.O_APPEND|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
 try{
  const s=await handle.stat();if(!s.isFile()||(s.mode&0o077)!==0||(process.getuid&&s.uid!==process.getuid()))fail('PERMISSION_FILE','','Use an owner-only regular agent approval log.');
  await handle.write(JSON.stringify({at:new Date().toISOString(),approvedBy:'agent',...entry})+'\n');
 }finally{await handle.close();}
}
export async function loadPermissions(path:string,actor:Actor):Promise<PermissionLease|undefined>{
 const captured=await capture(path);if(captured===undefined)return undefined;
 const sidePath=agentApprovalPath(path),side=await capture(sidePath);
 const encoded=JSON.parse(captured) as {bytes:string};const raw=parseJson(Buffer.from(encoded.bytes,'base64'));
 if(!record(raw))fail('PERMISSION_FORMAT','','Expected permission object.');keys(raw,['version','grants'],'permissions');
 if(raw.version!==1||!Array.isArray(raw.grants)||raw.grants.length>100)fail('PERMISSION_FORMAT','','Expected version 1 and at most 100 grants.');
 const grants:Grant[]=raw.grants.map(value=>{
  if(!record(value))fail('PERMISSION_FORMAT','','Expected grant object.');keys(value,['repo','operations','allowChild','allowHeadless','projectIds','agentApproval'],'grant');validateGrantRepo(value.repo);
  if(!Array.isArray(value.operations)||!value.operations.length||value.operations.some(x=>typeof x!=='string'||!allowed.has(x))||new Set(value.operations).size!==value.operations.length)fail('PERMISSION_FORMAT','','Unknown or repeated operation.');
  for(const key of ['allowChild','allowHeadless','agentApproval'])if(value[key]!==undefined&&typeof value[key]!=='boolean')fail('PERMISSION_FORMAT','','Actor flags must be booleans.');
  if(value.projectIds!==undefined&&(!Array.isArray(value.projectIds)||value.projectIds.length>100||value.projectIds.some(x=>typeof x!=='string'||!/^PVT_[A-Za-z0-9_-]+$/.test(x))))fail('PERMISSION_FORMAT','','Expected exact project IDs.');
  return {repo:value.repo as string,operations:value.operations as string[],allowChild:value.allowChild===true,allowHeadless:value.allowHeadless===true,projectIds:(value.projectIds??[]) as string[],agentApproval:value.agentApproval===true};
 });
 // The sidecar adds agent-approval grants without changing the permission file, which older pi-gh versions must keep reading.
 const sideGrants:Grant[]=side===undefined?[]:decodeSidecar(side);
 const digestOf=(a:string,b:string|undefined)=>createHash('sha256').update(a).update('\0').update(b??'').digest('hex');
 const digest=digestOf(captured,side);
 const agentGrants=[...grants.filter(g=>g.agentApproval),...sideGrants];
 return {
  allows:(operation,repo,projectId)=>grants.some(g=>grantCovers(g.repo,repo)&&g.operations.includes(operation)&&(!actor.child||g.allowChild)&&(!actor.headless||g.allowHeadless)&&(!projectId||g.projectIds.includes(projectId))),
  agentApproves:(operation,repo)=>allowed.has(operation)&&agentGrants.some(g=>grantCovers(g.repo,repo)&&(!actor.child||g.allowChild)&&(!actor.headless||g.allowHeadless)),
  recordAgentApproval:entry=>appendAgentApproval(join(dirname(resolve(path)),'pi-gh-agent-approvals.jsonl'),entry),
  isCurrent:async()=>{try{const next=await capture(path);return next!==undefined&&digestOf(next,await capture(sidePath))===digest;}catch{return false;}}
 };
}
/** pi-gh-agent-approval.json beside the permission file: {version:1, grants:[{repo, allowChild?, allowHeadless?}]}. */
export function agentApprovalPath(permissionFile:string){return join(dirname(resolve(permissionFile)),'pi-gh-agent-approval.json');}
function decodeSidecar(captured:string):Grant[]{
 const raw=parseJson(Buffer.from((JSON.parse(captured) as {bytes:string}).bytes,'base64'));
 if(!record(raw))fail('PERMISSION_FORMAT','','Expected agent approval object.');keys(raw,['version','grants'],'agent approvals');
 if(raw.version!==1||!Array.isArray(raw.grants)||raw.grants.length>100)fail('PERMISSION_FORMAT','','Expected version 1 and at most 100 agent approval grants.');
 return raw.grants.map(value=>{
  if(!record(value))fail('PERMISSION_FORMAT','','Expected agent approval grant object.');keys(value,['repo','allowChild','allowHeadless'],'agent approval grant');validateGrantRepo(value.repo);
  for(const key of ['allowChild','allowHeadless'])if(value[key]!==undefined&&typeof value[key]!=='boolean')fail('PERMISSION_FORMAT','','Actor flags must be booleans.');
  return {repo:value.repo as string,operations:[],allowChild:value.allowChild===true,allowHeadless:value.allowHeadless===true,projectIds:[],agentApproval:true};
 });
}
