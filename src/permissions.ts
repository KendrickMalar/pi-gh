import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {fail,keys,record,parseJson} from './core/data.js';
import {validateRepo} from './core/labels-input.js';

export type PermissionLease={allows:(operation:string,repo:string,projectId?:string)=>boolean;isCurrent:()=>Promise<boolean>};
export type Actor={child:boolean;headless:boolean};
const allowed=new Set(['gh_issue_submit','gh_label_create','gh_label_edit','gh_issue_labels','gh_issue_edit','gh_issue_close','gh_subissue_add','gh_dependency_add','gh_project_add_issue','gh_project_field_update']);
type Grant={repo:string;operations:string[];allowChild:boolean;allowHeadless:boolean;projectIds:string[]};
export function permissionPath(){return join(homedir(),'.pi','agent','pi-gh-permissions.json');}
async function capture(path:string):Promise<string|undefined>{
 const absolute=resolve(path);let parent=dirname(absolute);
 try{const named=await lstat(absolute);if(named.isSymbolicLink())fail('PERMISSION_FILE','','Permission file must not be a symlink.');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
 while(true){const s=await lstat(parent);if(!s.isDirectory()||s.isSymbolicLink())fail('PERMISSION_FILE','','Permission parents must be real directories.');const next=dirname(parent);if(next===parent)break;parent=next;}
 let handle;
 try{handle=await open(absolute,constants.O_RDONLY|constants.O_NOFOLLOW);}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
 try{
  const s=await handle.stat();if(!s.isFile()||s.size>65536||(s.mode&0o077)!==0||(process.getuid&&s.uid!==process.getuid()))fail('PERMISSION_FILE','','Use an owner-only regular permission file.');
  const bytes=await handle.readFile();const after=await handle.stat(),named=await lstat(absolute);
  if(named.isSymbolicLink()||s.ino!==named.ino||s.dev!==named.dev||s.size!==after.size||s.mtimeMs!==after.mtimeMs)fail('PERMISSION_FILE','','Permission file changed while reading.');
  return JSON.stringify({inode:s.ino,device:s.dev,mode:s.mode,bytes:bytes.toString('base64')});
 }finally{await handle.close();}
}
export async function loadPermissions(path:string,actor:Actor):Promise<PermissionLease|undefined>{
 const captured=await capture(path);if(captured===undefined)return undefined;
 const encoded=JSON.parse(captured) as {bytes:string};const raw=parseJson(Buffer.from(encoded.bytes,'base64'));
 if(!record(raw))fail('PERMISSION_FORMAT','','Expected permission object.');keys(raw,['version','grants'],'permissions');
 if(raw.version!==1||!Array.isArray(raw.grants)||raw.grants.length>100)fail('PERMISSION_FORMAT','','Expected version 1 and at most 100 grants.');
 const grants:Grant[]=raw.grants.map(value=>{
  if(!record(value))fail('PERMISSION_FORMAT','','Expected grant object.');keys(value,['repo','operations','allowChild','allowHeadless','projectIds'],'grant');validateRepo(value.repo);
  if(!Array.isArray(value.operations)||!value.operations.length||value.operations.some(x=>typeof x!=='string'||!allowed.has(x))||new Set(value.operations).size!==value.operations.length)fail('PERMISSION_FORMAT','','Unknown or repeated operation.');
  for(const key of ['allowChild','allowHeadless'])if(value[key]!==undefined&&typeof value[key]!=='boolean')fail('PERMISSION_FORMAT','','Actor flags must be booleans.');
  if(value.projectIds!==undefined&&(!Array.isArray(value.projectIds)||value.projectIds.length>100||value.projectIds.some(x=>typeof x!=='string'||!/^PVT_[A-Za-z0-9_-]+$/.test(x))))fail('PERMISSION_FORMAT','','Expected exact project IDs.');
  return {repo:value.repo as string,operations:value.operations as string[],allowChild:value.allowChild===true,allowHeadless:value.allowHeadless===true,projectIds:(value.projectIds??[]) as string[]};
 });
 const digest=createHash('sha256').update(captured).digest('hex');
 return {
  allows:(operation,repo,projectId)=>grants.some(g=>g.repo.toLowerCase()===repo.toLowerCase()&&g.operations.includes(operation)&&(!actor.child||g.allowChild)&&(!actor.headless||g.allowHeadless)&&(!projectId||g.projectIds.includes(projectId))),
  isCurrent:async()=>{try{const next=await capture(path);return next!==undefined&&createHash('sha256').update(next).digest('hex')===digest;}catch{return false;}}
 };
}
