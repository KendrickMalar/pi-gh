import {runGh,type GhOptions} from './gh-process.js';
import {createPreview} from './approval.js';
import {renderIssue} from './render.js';
import {validateDraft} from './draft.js';
import type {SubmitOutcome,ValidatedIssue} from './types.js';
import { submitLabelledIssue } from './issue-labels.js';
export async function submitIssue(issue:ValidatedIssue,approvedDigest:string,options:GhOptions={}):Promise<SubmitOutcome>{
 const checked=validateDraft(issue.draftInput,issue.bundle);
 if(!checked.issue)return {status:'rejected',problems:checked.problems};
 const preview=createPreview(checked.issue);
 if(preview.sensitive)return {status:'rejected',problems:[{code:'SENSITIVE',path:'',message:'Secret candidates must be removed before submission.'}]};
 if(!/^[a-f0-9]{64}$/.test(approvedDigest))return {status:'rejected',problems:[{code:'APPROVAL_MISMATCH',path:'',message:'Approval does not match the current content.'}]};
 if(checked.issue.draft.labels?.length)return submitLabelledIssue(checked.issue,approvedDigest,options);
 if(preview.digest!==approvedDigest)return {status:'rejected',problems:[{code:'APPROVAL_MISMATCH',path:'',message:'Approval does not match the current content.'}]};
 const fixed=renderIssue(checked.issue);
 const result=await runGh(['issue','create','--repo=github.com/'+fixed.repo,'--title='+fixed.title,'--body-file','-'],fixed.body,options);
 if(result.status==='not-started')return {status:'not-started',message:'Unable to start gh or invalid process limits.'};
 const urls=result.stdout.trim().split(/\s+/).filter(v=>v.startsWith('https://github.com/'));
 let url:string|undefined;
 if(urls.length===1){try{const u=new URL(urls[0]!);const parts=u.pathname.split('/');
 if(u.origin==='https://github.com'&&!u.search&&!u.hash&&parts.length===5&&(parts[1]+'/'+parts[2]).toLowerCase()===fixed.repo.toLowerCase()&&parts[3]==='issues'&&/^[1-9][0-9]*$/.test(parts[4]!))url=u.href;
 }catch{/* Invalid URL is uncertain. */}}
 if(result.status==='ok'&&url)return {status:'created',url};
 return {status:'unknown',message:'Submission outcome is uncertain. Check GitHub manually before retrying.',...(url?{candidateUrl:url}:{})};
}
