import {createPreview} from './approval.js';
import {GhClient,repositoryLabels,requireLabels,parseIssue,readIssue,repositoryIdentity,type Repository,type Label} from './labels-github.js';
import {sha} from './labels-approval.js';
import {renderIssue} from './render.js';
import {maskDecodedSecrets} from './secrets.js';
import {record,parseJson} from './data.js';
import type {Preview,ValidatedIssue,SubmitOutcome} from './types.js';
import type {GhOptions} from './gh-process.js';
export type IssueLabelPreview=Preview&{labelState?:Label[];repository?:Repository};
export async function createIssuePreview(issue:ValidatedIssue,options:GhOptions={},client?:GhClient):Promise<IssueLabelPreview>{
 const base=createPreview(issue);
 if(!issue.draft.labels?.length||base.sensitive)return base;
 const gh=client??new GhClient(issue.draft.repo,options);
 const repository=await repositoryIdentity(gh);
 const labels=requireLabels(await repositoryLabels(gh),issue.draft.labels);
 const masked=maskDecodedSecrets({repository,labels});
 const state=masked.value;
 return {...base,repository:state.repository,labels:state.labels.map(l=>l.name),labelState:state.labels,digest:sha(JSON.stringify({version:1,host:'github.com',issueDigest:base.digest,repository,labels})),sensitive:base.sensitive||masked.sensitive};
}
export async function submitLabelledIssue(issue:ValidatedIssue,digest:string,options:GhOptions={}):Promise<SubmitOutcome>{
 const client=new GhClient(issue.draft.repo,options);
 let preview:IssueLabelPreview;
 try{preview=await createIssuePreview(issue,options,client)}
 catch{return {status:'rejected',problems:[{code:'LABEL_PREFLIGHT',path:'labels',message:'Cannot confirm requested labels. No Issue created.'}]}}
 if(preview.sensitive)return {status:'rejected',problems:[{code:'SENSITIVE',path:'labels',message:'Remove secret candidates before submission.'}]};
 if(preview.digest!==digest)return {status:'rejected',problems:[{code:'APPROVAL_MISMATCH',path:'',message:'Input or labels changed; preview and approve again.'}]};
 const fixed=renderIssue(issue);
 const result=await client.request('POST','issues',{title:fixed.title,body:fixed.body,labels:preview.labels});
 if(result.status==='not-started')return {status:'not-started',message:'Issue creation process did not start.'};
 const uncertain:SubmitOutcome={status:'unknown',message:'Issue creation outcome is uncertain. Check GitHub manually before retrying.'};
 if(result.status!=='ok')return uncertain;
 try{
 const raw=parseJson(Buffer.from(result.stdout));const created=parseIssue(raw,fixed.repo);
 if(!record(raw)||raw.title!==fixed.title||raw.body!==fixed.body||created.identity.kind!=='issue')return uncertain;
 const current=await readIssue(client,created.identity.number);
 const confirmed=await client.read('issues/'+created.identity.number);
 if(current.identity.id!==created.identity.id||current.identity.node_id!==created.identity.node_id||JSON.stringify(current.labels)!==JSON.stringify(preview.labelState)||!record(confirmed)||confirmed.title!==fixed.title||confirmed.body!==fixed.body)return {...uncertain,candidateUrl:created.identity.url};
 return {status:'created',url:created.identity.url};
 }catch{return uncertain}
}
