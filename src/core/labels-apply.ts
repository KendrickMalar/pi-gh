import {DataError,fail} from './data.js';
import {validateLabelChange} from './labels-input.js';
import {previewLabelChange} from './labels-approval.js';
import {GhClient,repositoryLabels,readIssue,type Label} from './labels-github.js';
import {maskSecrets,maskDecodedSecrets} from './secrets.js';
import type {CapturedInput,ValidationProblem} from './types.js';
import type {GhOptions} from './gh-process.js';
export type LabelOutcome={status:'applied'|'noop'}|{status:'rejected';problems:ValidationProblem[]}|{status:'not-started'|'unknown';message:string};
export async function applyLabelChange(input:CapturedInput,digest:string,options:GhOptions={}):Promise<LabelOutcome>{
 let started=false;
 try{
 if(!/^[a-f0-9]{64}$/.test(digest))fail('APPROVAL_MISMATCH','','A valid approval digest is required.');
 const change=validateLabelChange(input);
 if(maskDecodedSecrets(change).sensitive||maskSecrets(input.bytes.toString('utf8')).sensitive)fail('SENSITIVE','','Remove secret candidates before applying.');
 const client=new GhClient(change.repo,options);
 const preview=await previewLabelChange(input,options,client);
 if(preview.sensitive)fail('SENSITIVE','','Remove secret candidates before applying.');
 if(preview.digest!==digest)fail('APPROVAL_MISMATCH','','Input or GitHub state changed; preview and approve again.');
 if(preview.noop)return {status:'noop'};
 let suffix:string,method:'POST'|'PATCH'|'DELETE',payload:unknown;
 if(change.operation==='issue-labels'){suffix='issues/'+change.issue;method='PATCH';payload={labels:(preview.after as Label[]).map(l=>l.name)}}
 else if(change.operation==='label-create'){suffix='labels';method='POST';payload={name:change.name,color:change.color,description:change.description??''}}
 else{
 suffix='labels/'+encodeURIComponent((preview.before as Label).name);
 if(change.operation==='label-delete'){method='DELETE'}
 else {method='PATCH';payload={...(change.newName===undefined?{}:{new_name:change.newName}),...(change.color===undefined?{}:{color:change.color}),...(change.description===undefined?{}:{description:change.description})}}
 }
 const result=await client.request(method,suffix,payload);
 if(result.status==='not-started')return {status:'not-started',message:'Change process did not start.'};
 started=true;
 if(result.status!=='ok')throw new Error('Uncertain write');
 if(change.operation==='issue-labels'){
 const current=await readIssue(client,change.issue);
 if(JSON.stringify(current.identity)!==JSON.stringify(preview.issue)||JSON.stringify(current.labels)!==JSON.stringify(preview.after))throw new Error('Unconfirmed issue labels');
 }else{
 const all=await repositoryLabels(client), expected=preview.after as Label|null, before=preview.before as Label|null;
 if(!expected){if(all.some(l=>l.id===before!.id||l.name.toLowerCase()===before!.name.toLowerCase()))throw new Error('Unconfirmed deletion')}
 else{
 const current=all.find(l=>l.name===expected.name);
 if(!current||current.color!==expected.color||current.description!==expected.description||(before&&(current.id!==before.id||current.node_id!==before.node_id)))throw new Error('Unconfirmed label');
 }
 }
 return {status:'applied'};
 }catch(e){
 if(started)return {status:'unknown',message:'Change outcome is uncertain. Check GitHub manually before retrying.'};
 return {status:'rejected',problems:[e instanceof DataError?{code:e.code,path:e.field,message:e.message}:{code:'LABEL_FAILED',path:'',message:'Could not confirm label change. No changes performed.'}]};
 }
}
