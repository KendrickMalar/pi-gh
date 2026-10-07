import {fail,keys,record,parseJson,nonblank} from './data.js';
import type {CapturedInput} from './types.js';
type Base = {version:1; repo:string};
export type LabelChange = Base & (
 {operation:'issue-labels'; issue:number; add?:string[]; remove?:string[]} |
 {operation:'label-create'; name:string; color:string; description?:string} |
 {operation:'label-edit'; name:string; newName?:string; color?:string; description?:string} |
 {operation:'label-delete'; name:string}
);
export function labelKey(name:string):string { return name.toLowerCase(); }
export function validateRepo(value:unknown): asserts value is string {
 if(typeof value!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}\/[a-zA-Z0-9_.][a-zA-Z0-9_.-]{0,99}$/.test(value)||value.endsWith('/.')||value.endsWith('/..'))
 fail('LABEL_REPO','repo','Expected OWNER/REPO.');
}
export function validateLabelName(value:unknown): asserts value is string {
 if(!nonblank(value)||value==='.'||value==='..'||/[\u0000-\u001f\u007f]/.test(value)||Array.from(value).length>50)
 fail('LABEL_NAME','labels','Expected a nonblank label name up to 50 characters without control characters.');
}
export function validateLabelNames(value:unknown):string[] {
 if(!Array.isArray(value)||value.length>100) fail('LABEL_LIST','labels','Expected at most 100 label names.');
 const seen=new Set<string>();
 for(const name of value) {validateLabelName(name);const key=labelKey(name);if(seen.has(key))fail('LABEL_DUPLICATE','labels','Duplicate label name.');seen.add(key);}
 return value as string[];
}
export function validateLabelChange(input:CapturedInput):LabelChange {
 const v=parseJson(input.bytes);
 if(!record(v)||v.version!==1)fail('LABEL_INPUT','','Expected version 1 label change.');
 validateRepo(v.repo);
 const allowed:Record<string,string[]> = {
 'issue-labels':['issue','add','remove'],'label-create':['name','color','description'],
 'label-edit':['name','newName','color','description'],'label-delete':['name']
 };
 if(typeof v.operation!=='string'||!Object.hasOwn(allowed,v.operation))fail('LABEL_OPERATION','operation','Unknown label operation.');
 keys(v,['version','repo','operation',...allowed[v.operation]!],'change');
 if(v.operation==='issue-labels') {
 if(!Number.isSafeInteger(v.issue)||(v.issue as number)<1)fail('LABEL_ISSUE','issue','Expected a positive Issue number.');
 const add=v.add===undefined?[]:validateLabelNames(v.add), remove=v.remove===undefined?[]:validateLabelNames(v.remove);
 if(!add.length&&!remove.length)fail('LABEL_EMPTY','','No label changes requested.');
 if(add.some(x=>remove.some(y=>labelKey(x)===labelKey(y))))fail('LABEL_CONFLICT','','Cannot add and remove the same label.');
 } else {
 validateLabelName(v.name);
 if(v.newName!==undefined)validateLabelName(v.newName);
 if(v.operation==='label-create'||v.color!==undefined)
 if(typeof v.color!=='string'||! /^[0-9a-fA-F]{6}$/.test(v.color))fail('LABEL_COLOR','color','Expected a six-digit hexadecimal color.');
 if(v.description!==undefined&&(typeof v.description!=='string'||/[\u0000-\u001f\u007f]/.test(v.description)||Array.from(v.description).length>100))
 fail('LABEL_DESCRIPTION','description','Expected a single-line description up to 100 characters.');
 if(v.operation==='label-edit'&&v.newName===undefined&&v.color===undefined&&v.description===undefined)fail('LABEL_EMPTY','','No label changes requested.');
 }
 return v as LabelChange;
}
