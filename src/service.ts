import {loadDraft,validateDraft} from './core/draft.js';
import {loadTemplate} from './core/template.js';
import {renderForm} from './core/forms.js';
import {createIssuePreview} from './core/issue-labels.js';
import {submitIssue} from './core/submit.js';
import {validateLabelChange} from './core/labels-input.js';
import {previewLabelChange} from './core/labels-approval.js';
import {applyLabelChange} from './core/labels-apply.js';
import {maskDecodedSecrets} from './core/secrets.js';
import {fail,parseJson} from './core/data.js';
import {validateArguments,templatePath,inputPath} from './paths.js';
import {safeResult,rejected,errorResult} from './result.js';
import type {GhOptions} from './core/gh-process.js';
import type {Operation,IssueArgs,LabelsArgs,FormArgs,OperationContext,OperationResult,ApprovalView} from './service-types.js';
const operations=['gh_issue_validate','gh_issue_preview','gh_issue_submit','gh_labels_validate','gh_labels_preview','gh_labels_apply','gh_issue_form'];
function active(ctx:OperationContext){return !ctx.signal.aborted&&ctx.isCurrent();}
function requireActive(ctx:OperationContext){if(!active(ctx))fail('STALE_OPERATION','','Operation was cancelled or its session changed.');}
async function confirm(view:ApprovalView,ctx:OperationContext):Promise<boolean>{
 if(!active(ctx))return false;
 let listener:()=>void=()=>{};const cancelled=new Promise<boolean>(resolve=>{listener=()=>resolve(false);ctx.signal.addEventListener('abort',listener,{once:true});});
 try{return await Promise.race([Promise.resolve().then(()=>active(ctx)?ctx.confirm(view):false),cancelled]);}
 finally{ctx.signal.removeEventListener('abort',listener);}
}
async function issue(args:IssueArgs,ctx:OperationContext,withPreview=true){
 const input=await loadDraft(inputPath(args.draftPath,ctx)),bundle=await loadTemplate(templatePath(args,ctx)),checked=validateDraft(input,bundle);
 if(!checked.issue)return {checked};
 if(!withPreview)return {checked};
 const sensitive=maskDecodedSecrets(parseJson(input.bytes)).sensitive||maskDecodedSecrets({template:bundle.template,policy:bundle.policy}).sensitive;
 const preview=await createIssuePreview(checked.issue,{signal:ctx.signal,beforeStart:()=>active(ctx)});
 return {checked,preview:{...preview,sensitive:preview.sensitive||sensitive}};
}
export async function runOperation(operation:Operation,args:IssueArgs|LabelsArgs|FormArgs,ctx:OperationContext):Promise<OperationResult>{
 try{
  if(!operations.includes(operation))return rejected('ARGUMENT','Unknown operation.');
  validateArguments(operation,args);requireActive(ctx);
  const write=operation==='gh_issue_submit'||operation==='gh_labels_apply';
  if(write&&!ctx.interactive)return rejected('APPROVAL_UI_REQUIRED','External changes require a local human confirmation screen.');
  const options:GhOptions={signal:ctx.signal,beforeStart:()=>active(ctx)};
  if(operation==='gh_issue_form'){const bundle=await loadTemplate(templatePath(args as FormArgs,ctx));requireActive(ctx);return safeResult({status:'generated',data:{yaml:renderForm(bundle)}});}
  if(operation.startsWith('gh_labels_')){
   const path=inputPath((args as LabelsArgs).changePath,ctx),input=await loadDraft(path);validateLabelChange(input);
   if(operation==='gh_labels_validate')return safeResult({status:'validated'});
   const preview=await previewLabelChange(input,options);requireActive(ctx);
   const sensitive=preview.sensitive||maskDecodedSecrets(parseJson(input.bytes)).sensitive;
   const displayed={...preview,sensitive};
   if(operation==='gh_labels_preview')return safeResult({status:'preview',data:displayed});
   if(sensitive)return rejected('SENSITIVE','Remove secret candidates before applying.');
   if(!await confirm({operation,text:JSON.stringify(maskDecodedSecrets(displayed).value,null,2),digest:preview.digest},ctx))return rejected('APPROVAL_DENIED','Change was not approved.');
   requireActive(ctx);const latest=await loadDraft(path),next=await previewLabelChange(latest,options);requireActive(ctx);
   if(next.digest!==preview.digest||next.sensitive||maskDecodedSecrets(parseJson(latest.bytes)).sensitive)return rejected('APPROVAL_MISMATCH','Input or GitHub state changed; preview and approve again.');
   const result=await applyLabelChange(latest,preview.digest,options);return safeResult({...result});
  }
  const captured=await issue(args as IssueArgs,ctx,operation!=='gh_issue_validate');requireActive(ctx);
  if(!captured.checked.issue)return safeResult({status:'rejected',problems:captured.checked.problems});
  if(operation==='gh_issue_validate')return safeResult({status:'validated'});
  const preview=captured.preview!;
  if(operation==='gh_issue_preview')return safeResult({status:'preview',data:preview});
  if(preview.sensitive)return rejected('SENSITIVE','Remove secret candidates before submitting.');
  if(!await confirm({operation,text:JSON.stringify(maskDecodedSecrets(preview).value,null,2),digest:preview.digest},ctx))return rejected('APPROVAL_DENIED','Issue was not approved.');
  requireActive(ctx);const latest=await issue(args as IssueArgs,ctx);requireActive(ctx);
  if(!latest.checked.issue||latest.preview!.digest!==preview.digest||latest.preview!.sensitive)return rejected('APPROVAL_MISMATCH','Input or GitHub state changed; preview and approve again.');
  const result=await submitIssue(latest.checked.issue,preview.digest,options);
  return safeResult(result.status==='created'?{status:'created',data:{url:result.url}}:{...result});
 }catch(error){return errorResult(error);}
}
