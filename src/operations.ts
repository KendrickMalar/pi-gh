import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {loadDraft} from './core/draft.js';
import {maskDecodedSecrets} from './core/secrets.js';
import {fail} from './core/data.js';
import {safeResult,errorResult,rejected} from './result.js';
import {authorize,recheckAuthority} from './service.js';
import {GithubApi,object,array,addProjectIssueMutation,updateProjectFieldMutation,type JsonObject} from './github-api.js';
import {githubReads,githubWrites,validateGithubArgs,validateChange,type GithubOperation,type GithubArgs,type Change} from './operation-input.js';
import type {OperationContext,OperationResult} from './service-types.js';

type Snapshot={issue?:JsonObject;related?:JsonObject;relations?:unknown[];project?:JsonObject;item?:JsonObject;field?:JsonObject;noop:boolean};
function active(ctx:OperationContext){return !ctx.signal.aborted&&ctx.isCurrent();}
function requireActive(ctx:OperationContext){if(!active(ctx))fail('STALE_OPERATION','','Session changed or operation was cancelled.');}
function digest(bytes:Buffer,before:Snapshot){return createHash('sha256').update(bytes).update(JSON.stringify(before)).digest('hex');}
function fieldValue(item:JsonObject,fieldId:string):JsonObject|undefined{
 return array(object(item.fieldValues).nodes).map(object).find(v=>v.field!==undefined&&object(v.field).id===fieldId);
}
function equalField(item:JsonObject,c:Change){const value=fieldValue(item,c.fieldId!);if(!value)return false;const [key,wanted]=Object.entries(c.value!)[0]!;return value[key==='singleSelectOptionId'?'optionId':key]===wanted;}
function verifyItem(item:JsonObject,repo:string){const content=object(item.content);if(content.__typename!=='Issue'||object(content.repository).nameWithOwner?.toString().toLowerCase()!==repo.toLowerCase())fail('GITHUB_IDENTITY','','Project item does not belong to the specified repository Issue.');}
async function snapshot(api:GithubApi,c:Change):Promise<Snapshot>{
 const s:Snapshot={noop:false};
 if(c.issue!==undefined)s.issue=await api.issue(c.repo,c.issue);
 if(c.operation==='issue-edit'){s.noop=(c.title===undefined||c.title===s.issue!.title)&&(c.body===undefined||c.body===s.issue!.body);return s;}
 if(c.operation==='issue-close'){s.noop=s.issue!.state==='closed'&&s.issue!.state_reason===(c.reason??'completed');return s;}
 if(c.operation==='subissue-add'||c.operation==='dependency-add'){
  s.related=await api.issue(c.repo,c.relatedIssue!);const suffix=c.operation==='subissue-add'?'sub_issues':'dependencies/blocked_by';
  s.relations=await api.restList('repos/'+c.repo+'/issues/'+c.issue+'/'+suffix);s.noop=s.relations.some(v=>object(v).id===s.related!.id);return s;
 }
 const fields=await api.project(c.projectId!,'fields'),items=await api.project(c.projectId!,'items');s.project={...fields,...items};
 if(c.operation==='project-add-issue'){
  s.item=array(items.items).map(object).find(item=>item.content!==null&&object(item.content).id===s.issue!.node_id);
  if(s.item){verifyItem(s.item,c.repo);s.noop=true;}return s;
 }
 s.item=array(items.items).map(object).find(item=>item.id===c.itemId);if(!s.item)fail('GITHUB_IDENTITY','','Item is not in the specified project.');verifyItem(s.item,c.repo);
 s.field=array(fields.fields).map(object).find(field=>field.id===c.fieldId);if(!s.field)fail('GITHUB_IDENTITY','','Field is not in the specified project.');
 const key=Object.keys(c.value!)[0]!,types:Record<string,string>={text:'TEXT',number:'NUMBER',date:'DATE',singleSelectOptionId:'SINGLE_SELECT'};
 if(s.field.dataType!==types[key])fail('ARGUMENT','','Field type does not match the supplied value.');
 if(key==='singleSelectOptionId'&&!array(s.field.options).some(v=>object(v).id===c.value!.singleSelectOptionId))fail('ARGUMENT','','Option is not in the specified field.');
 s.noop=equalField(s.item,c);return s;
}
async function apply(api:GithubApi,c:Change,before:Snapshot){
 const endpoint='repos/'+c.repo+'/issues/'+c.issue;
 switch(c.operation){
  case 'issue-edit':return api.mutateRest(endpoint,'PATCH',{...(c.title!==undefined?{title:c.title}:{}),...(c.body!==undefined?{body:c.body}:{})});
  case 'issue-close':return api.mutateRest(endpoint,'PATCH',{state:'closed',state_reason:c.reason??'completed'});
  case 'subissue-add':return api.mutateRest(endpoint+'/sub_issues','POST',{sub_issue_id:before.related!.id});
  case 'dependency-add':return api.mutateRest(endpoint+'/dependencies/blocked_by','POST',{issue_id:before.related!.id});
  case 'project-add-issue':return api.mutateGraphql(addProjectIssueMutation,{projectId:c.projectId,contentId:before.issue!.node_id});
  case 'project-field-update':return api.mutateGraphql(updateProjectFieldMutation,{projectId:c.projectId,itemId:c.itemId,fieldId:c.fieldId,value:c.value});
  default:fail('ARGUMENT','','Unknown change.');
 }
}
export async function runGithubOperation(name:GithubOperation,args:GithubArgs,ctx:OperationContext):Promise<OperationResult>{
 let mutationStarted=false;
 try{
  if(![...githubReads,...githubWrites].includes(name))return rejected('ARGUMENT','Unknown operation.');validateGithubArgs(name,args);requireActive(ctx);
  const write=(githubWrites as readonly string[]).includes(name);
  if(write&&!ctx.interactive&&!ctx.permissions)return rejected('APPROVAL_UI_REQUIRED','External changes require local approval or an exact permission grant.');
  let machineAuthority=false;
  const api=new GithubApi({signal:ctx.signal,beforeStart:()=>active(ctx),beforeStartAsync:async()=>!machineAuthority||!!ctx.permissions&&await ctx.permissions.isCurrent()});
  if(!write){
   let data:unknown;
   if(name==='gh_project_get'||name==='gh_project_items')data=await api.project(args.projectId!,name==='gh_project_get'?'fields':'items');
   else if(name==='gh_issue_list')data=(await api.restList('repos/'+args.repo+'/issues?state='+(args.state??'all'))).filter(v=>object(v).pull_request===undefined);
   else {const issue=await api.issue(args.repo!,args.issue!);data=name==='gh_issue_get'?issue:await api.restList('repos/'+args.repo+'/issues/'+args.issue+'/'+(name==='gh_subissues_list'?'sub_issues':'dependencies/blocked_by'));}
   requireActive(ctx);return safeResult({status:'read',data});
  }
  const path=resolve(ctx.cwd,args.changePath!),input=await loadDraft(path),change=validateChange(name,input);
  if(maskDecodedSecrets(change).sensitive)return rejected('SENSITIVE','Remove secret candidates before applying.');
  if(!ctx.interactive&&!ctx.permissions?.allows(name,change.repo,change.projectId))return rejected('PERMISSION_DENIED','No matching operation/repository/project/actor permission.');
  const before=await snapshot(api,change);requireActive(ctx);
  const preview={operation:name,change,before};if(maskDecodedSecrets(preview).sensitive)return rejected('SENSITIVE','Remove secret candidates before applying.');
  if(before.noop)return safeResult({status:'noop',data:{repo:change.repo,operation:name}});
  const hash=digest(input.bytes,before),machine=await authorize({operation:name,text:JSON.stringify(preview,null,2),digest:hash},ctx,change.repo,name,change.projectId);
  machineAuthority=machine;
  const latest=await loadDraft(path),nextChange=validateChange(name,latest),next=await snapshot(api,nextChange);requireActive(ctx);
  if(digest(latest.bytes,next)!==hash||maskDecodedSecrets({change:nextChange,before:next}).sensitive)return rejected('APPROVAL_MISMATCH','Input or remote state changed; preview again.');
  await recheckAuthority(ctx,machine);mutationStarted=true;
  const result=await apply(api,change,before);
  if(result.status!=='ok')return safeResult({status:result.status,message:result.status==='unknown'?'Change outcome is uncertain; inspect GitHub before retrying.':'Change did not start.'});
  const verified=await snapshot(api,change);requireActive(ctx);
  if(!verified.noop)return safeResult({status:'unknown',message:'Write returned, but the requested state could not be verified. Inspect GitHub before retrying.'});
  return safeResult({status:'applied',data:{repo:change.repo,operation:name,...(change.projectId?{projectId:change.projectId}:{}),...(verified.issue?{issue:verified.issue}:{}),...(verified.item?{itemId:verified.item.id}:{})}});
 }catch(error){return mutationStarted?safeResult({status:'unknown',message:'Change or its verification was interrupted; inspect GitHub before retrying.'}):errorResult(error);}
}
