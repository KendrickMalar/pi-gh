import {createHash} from 'node:crypto';
import {validateLabelChange} from './labels-input.js';
import {GhClient,captureLabelState,type LabelState} from './labels-github.js';
import {maskSecrets,maskDecodedSecrets} from './secrets.js';
import type {CapturedInput} from './types.js';
import type {GhOptions} from './gh-process.js';
export type LabelPreview=LabelState&{digest:string;sensitive:boolean;noop:boolean};
export const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export async function previewLabelChange(input:CapturedInput,options:GhOptions={},client?:GhClient):Promise<LabelPreview>{
 const change=validateLabelChange(input);
 const state=await captureLabelState(change,client??new GhClient(change.repo,options));
 const digest=sha(JSON.stringify({version:1,host:'github.com',path:input.path,input:sha(input.bytes),state}));
 const masked=maskDecodedSecrets(state);
 return {...masked.value,digest,sensitive:masked.sensitive||maskDecodedSecrets(change).sensitive||maskSecrets(input.bytes.toString('utf8')).sensitive,noop:JSON.stringify(state.before)===JSON.stringify(state.after)};
}
