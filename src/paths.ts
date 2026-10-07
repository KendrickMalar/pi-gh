import {resolve,join} from 'node:path';
import {fail,record} from './core/data.js';
import type {Operation,IssueArgs,FormArgs,OperationContext} from './service-types.js';
export function validateArguments(operation:Operation,args:unknown):void{
 if(!record(args))fail('ARGUMENT','','Arguments must be an object.');
 const label=operation.startsWith('gh_labels_'),form=operation==='gh_issue_form';
 const allowed=label?['changePath']:form?['template','templatePath']:['draftPath','template','templatePath'];
 if(Object.keys(args).some(key=>!allowed.includes(key)))fail('ARGUMENT','','Unknown argument.');
 for(const key of [label?'changePath':form?'':'draftPath','templatePath'])if(key&&args[key]!==undefined&&(typeof args[key]!=='string'||!(args[key] as string).trim()))fail('ARGUMENT',key,'A non-empty path is required.');
 if(!form&&typeof args[label?'changePath':'draftPath']!=='string')fail('ARGUMENT','','Input path is required.');
 if(args.template!==undefined&&!['parent','task'].includes(args.template as string))fail('ARGUMENT','template','Unknown standard template.');
 if(args.template!==undefined&&args.templatePath!==undefined)fail('ARGUMENT','template','Choose standard or custom template, not both.');
}
export function templatePath(args:IssueArgs|FormArgs,ctx:OperationContext):string{return args.templatePath?resolve(ctx.cwd,args.templatePath):join(ctx.packageRoot,'templates',(args.template??'task')+'.yml');}
export function inputPath(path:string,ctx:OperationContext):string{return resolve(ctx.cwd,path);}
