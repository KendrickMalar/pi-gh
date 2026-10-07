import {Type} from '@earendil-works/pi-ai';
import type {ExtensionAPI,ExtensionToolContext} from '@earendil-works/pi-coding-agent';
import {runOperation} from '../dist/src/service.js';
import {safeResult} from '../dist/src/result.js';
import type {Operation,IssueArgs,LabelsArgs,FormArgs} from '../src/service-types.js';
import {showApproval} from './approval-ui.ts';
import {RuntimeScope} from './runtime-scope.ts';
const template={template:Type.Optional(Type.Union([Type.Literal('parent'),Type.Literal('task')])),templatePath:Type.Optional(Type.String({minLength:1}))};
const issue=Type.Object({draftPath:Type.String({minLength:1}),...template},{additionalProperties:false});
const labels=Type.Object({changePath:Type.String({minLength:1})},{additionalProperties:false});
const form=Type.Object(template,{additionalProperties:false});
const operations:Operation[]=['gh_issue_validate','gh_issue_preview','gh_issue_submit','gh_labels_validate','gh_labels_preview','gh_labels_apply','gh_issue_form'];
function identity(ctx:ExtensionToolContext){return ctx.sessionManager.getSessionId()+':'+ctx.sessionManager.getLeafId();}
export function registerTools(pi:ExtensionAPI,scope:RuntimeScope,packageRoot:string){
 for(const name of operations){
  const write=name==='gh_issue_submit'||name==='gh_labels_apply';
  pi.registerTool({
   name,label:name,description:write?'Preview and obtain local human approval for this one GitHub change. Refuses headless/RPC/child modes; never auto-retries unknown outcomes.':name==='gh_issue_form'?'Return GitHub Issue Form YAML without writing a file.':'Validate or preview a GitHub workflow. Preview may read remote metadata; never changes GitHub.',
   parameters:name.startsWith('gh_labels_')?labels:name==='gh_issue_form'?form:issue,
   exposure:write?'model-only':'direct',executionMode:write?'sequential':'parallel',
   annotations:{readOnlyHint:!write,destructiveHint:write,idempotentHint:!write,openWorldHint:name!=='gh_issue_validate'&&name!=='gh_labels_validate'&&name!=='gh_issue_form'},
   async execute(_id,args,signal,_update,ctx){
    const captured=identity(ctx),lease=scope.acquire(signal),isCurrent=()=>scope.isCurrent(lease.stamp)&&identity(ctx)===captured;
    const work=()=>runOperation(name,args as IssueArgs|LabelsArgs|FormArgs,{
     cwd:ctx.cwd,packageRoot,interactive:ctx.mode==='tui'&&ctx.hasUI&&!process.env.PI_SUBAGENT_CHILD,signal:lease.signal,stamp:lease.stamp,isCurrent,
     confirm:view=>showApproval(view,{signal:lease.signal,isCurrent},ctx.ui)
    });
    try{
     const result=safeResult(write?await scope.runExclusive(work):await work());
     const full=JSON.stringify(result),limit=32768;
     return {content:[{type:'text' as const,text:full.length<=limit?full:full.slice(0,limit)+'\n[truncated; complete masked data in structuredContent]'}],details:result,structuredContent:result as never,isError:['rejected','not-started','unknown'].includes(result.status)};
    }catch{return {content:[{type:'text' as const,text:'Session changed or operation was cancelled.'}],details:{status:'rejected'},isError:true};}
    finally{lease.dispose();}
   }
  });
 }
}
