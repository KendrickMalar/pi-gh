import {fail,keys,record,parseJson} from './core/data.js';
import {validateRepo} from './core/labels-input.js';
import type {CapturedInput} from './core/types.js';
export const githubReads=['gh_issue_get','gh_issue_list','gh_subissues_list','gh_dependencies_list','gh_project_get','gh_project_items','gh_labels_list'] as const;
export const githubWrites=['gh_issue_edit','gh_issue_close','gh_subissue_add','gh_dependency_add','gh_project_add_issue','gh_project_field_update'] as const;
export type GithubOperation=typeof githubReads[number]|typeof githubWrites[number];
export type GithubArgs={repo?:string;issue?:number;state?:'open'|'closed'|'all';projectId?:string;changePath?:string};
export type FieldValue={text?:string;number?:number;date?:string;singleSelectOptionId?:string};
export type Change={version:1;repo:string;operation:string;issue?:number;title?:string;body?:string;reason?:'completed'|'not_planned';relatedIssue?:number;projectId?:string;itemId?:string;fieldId?:string;value?:FieldValue};
export function positive(value:unknown):asserts value is number{if(!Number.isSafeInteger(value)||(value as number)<1)fail('ARGUMENT','','Expected a positive Issue number.');}
export function nodeId(value:unknown,prefix:string):asserts value is string{if(typeof value!=='string'||!new RegExp('^'+prefix+'[A-Za-z0-9_-]{1,200}$').test(value))fail('ARGUMENT','','Invalid GitHub node ID.');}
export function validateGithubArgs(name:GithubOperation,args:unknown):asserts args is GithubArgs{
 if(!record(args))fail('ARGUMENT','','Expected an argument object.');
 if((githubWrites as readonly string[]).includes(name)){keys(args,['changePath'],'arguments');if(typeof args.changePath!=='string'||!args.changePath.trim())fail('ARGUMENT','','Expected changePath.');return;}
 if(name.startsWith('gh_project_')){keys(args,['projectId'],'arguments');nodeId(args.projectId,'PVT_');return;}
 if(name==='gh_labels_list'){keys(args,['repo'],'arguments');validateRepo(args.repo);return;}
 keys(args,name==='gh_issue_list'?['repo','state']:['repo','issue'],'arguments');validateRepo(args.repo);
 if(name==='gh_issue_list'){if(args.state!==undefined&&!['open','closed','all'].includes(args.state as string))fail('ARGUMENT','','Unknown Issue state.');}else positive(args.issue);
}
const changes:Record<string,{name:GithubOperation;keys:string[]}>= {
 'issue-edit':{name:'gh_issue_edit',keys:['issue','title','body']},
 'issue-close':{name:'gh_issue_close',keys:['issue','reason']},
 'subissue-add':{name:'gh_subissue_add',keys:['issue','relatedIssue']},
 'dependency-add':{name:'gh_dependency_add',keys:['issue','relatedIssue']},
 'project-add-issue':{name:'gh_project_add_issue',keys:['issue','projectId']},
 'project-field-update':{name:'gh_project_field_update',keys:['projectId','itemId','fieldId','value']}
};
export function validateChange(name:GithubOperation,input:CapturedInput):Change{
 const raw=parseJson(input.bytes);if(!record(raw)||raw.version!==1||typeof raw.operation!=='string')fail('ARGUMENT','','Expected version 1 change.');
 const definition=changes[raw.operation];if(!definition||definition.name!==name)fail('ARGUMENT','','Change does not match the tool operation.');
 keys(raw,['version','repo','operation',...definition.keys],'change');validateRepo(raw.repo);
 if(raw.operation!=='project-field-update')positive(raw.issue);
 if(raw.operation==='issue-edit'){
  if(raw.title===undefined&&raw.body===undefined)fail('ARGUMENT','','No edit requested.');
  if(raw.title!==undefined&&(typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>256||/[\u0000-\u001f\u007f]/.test(raw.title)))fail('ARGUMENT','','Invalid title.');
  if(raw.body!==undefined&&(typeof raw.body!=='string'||raw.body.length>65536))fail('ARGUMENT','','Invalid body.');
 }
 if(raw.operation==='issue-close'&&raw.reason!==undefined&&!['completed','not_planned'].includes(raw.reason as string))fail('ARGUMENT','','Invalid close reason.');
 if(raw.operation==='subissue-add'||raw.operation==='dependency-add'){positive(raw.relatedIssue);if(raw.relatedIssue===raw.issue)fail('ARGUMENT','','Self-links are forbidden.');}
 if(raw.operation.startsWith('project-'))nodeId(raw.projectId,'PVT_');
 if(raw.operation==='project-field-update'){
  nodeId(raw.itemId,'PVTI_');if(typeof raw.fieldId!=='string'||!/^PVT(F|SSF)_[A-Za-z0-9_-]{1,200}$/.test(raw.fieldId))fail('ARGUMENT','','Invalid field ID.');
  if(!record(raw.value)||Object.keys(raw.value).length!==1)fail('ARGUMENT','','Expected one typed field value.');keys(raw.value,['text','number','date','singleSelectOptionId'],'field value');
  const v=raw.value;
  if('text'in v&&(typeof v.text!=='string'||v.text.length>20000))fail('ARGUMENT','','Invalid text.');
  if('number'in v&&(typeof v.number!=='number'||!Number.isFinite(v.number)))fail('ARGUMENT','','Invalid number.');
  if('date'in v){if(typeof v.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||!Number.isFinite(Date.parse(v.date))||new Date(v.date).toISOString().slice(0,10)!==v.date)fail('ARGUMENT','','Invalid ISO date.');}
  if('singleSelectOptionId'in v&&(typeof v.singleSelectOptionId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(v.singleSelectOptionId)))fail('ARGUMENT','','Invalid option ID.');
 }
 return raw as Change;
}
