// Test-only process adapter preserving legacy core integration cases; not distributed or registered.
import {loadDraft,validateDraft} from '../src/core/draft.js';
import {loadTemplate} from '../src/core/template.js';
import {createIssuePreview} from '../src/core/issue-labels.js';
import {submitIssue} from '../src/core/submit.js';
import {validateLabelChange} from '../src/core/labels-input.js';
import {previewLabelChange} from '../src/core/labels-approval.js';
import {applyLabelChange} from '../src/core/labels-apply.js';
import {DataError,fail} from '../src/core/data.js';
import {maskSecrets} from '../src/core/secrets.js';
const args=process.argv.slice(2);
const output=(value:unknown)=>process.stdout.write(typeof value==='string'?value+'\n':JSON.stringify(value)+'\n');
try {
 if(args[0]==='labels'){
  const op=args[1],extra=args.slice(3);if(!args[2]||!['validate','preview','apply'].includes(op??'')||(op==='validate'&&extra.length)||(op==='preview'&&!(extra.length===0||extra.length===1&&extra[0]==='--json'))||(op==='apply'&&!(extra.length===2&&extra[0]==='--approved-digest'&&extra[1])))fail('ARGUMENT','','Invalid test arguments.');const input=await loadDraft(args[2]!);
  if(op==='validate'){validateLabelChange(input);output('Valid label change.');}
  else if(op==='preview')output(await previewLabelChange(input));
  else if(op==='apply'){const result=await applyLabelChange(input,args[args.indexOf('--approved-digest')+1]!);const success=['applied','noop'].includes(result.status);(success?process.stdout:process.stderr).write(maskSecrets(JSON.stringify(result)).text+'\n');process.exitCode=success?0:result.status==='rejected'?2:3;}
  else throw new Error('Invalid test operation');
 }else{
  const checked=validateDraft(await loadDraft(args[1]!),await loadTemplate(args[args.indexOf('--template')+1]!));
  if(!checked.issue){output({problems:checked.problems});process.exitCode=2;}
  else if(args[0]==='validate')output('Valid issue draft.');
  else if(args[0]==='preview')output(await createIssuePreview(checked.issue));
  else if(args[0]==='submit'){const result=await submitIssue(checked.issue,args[args.indexOf('--approved-digest')+1]!);output(result.status==='created'?result.url:result);process.exitCode=result.status==='created'?0:result.status==='rejected'?2:3;}
  else throw new Error('Invalid test operation');
 }
}catch(e){process.stderr.write(maskSecrets(JSON.stringify(e instanceof DataError?{code:e.code,path:e.field,message:e.message}:{code:'INTERNAL',message:'Test operation failed.'})).text+'\n');process.exitCode=e instanceof DataError?2:1;}
