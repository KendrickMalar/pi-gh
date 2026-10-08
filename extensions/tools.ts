import {Type} from '@earendil-works/pi-ai';
import type {ExtensionAPI,ExtensionToolContext} from '@earendil-works/pi-coding-agent';
import {runOperation} from '../dist/src/service.js';
import {safeResult,errorResult} from '../dist/src/result.js';
import {loadPermissions,permissionPath} from '../dist/src/permissions.js';
import {runGithubOperation} from '../dist/src/operations.js';
import {githubReads,githubWrites} from '../dist/src/operation-input.js';
import type {GithubOperation,GithubArgs} from '../src/operation-input.js';
import type {Operation,IssueArgs,LabelsArgs,FormArgs,OperationResult} from '../src/service-types.js';
import {showApproval} from './approval-ui.ts';
import {RuntimeScope} from './runtime-scope.ts';
const template={template:Type.Optional(Type.Union([Type.Literal('parent'),Type.Literal('task')])),templatePath:Type.Optional(Type.String({minLength:1}))};
const issue=Type.Object({draftPath:Type.String({minLength:1}),...template},{additionalProperties:false});
const labels=Type.Object({changePath:Type.String({minLength:1})},{additionalProperties:false});
const form=Type.Object(template,{additionalProperties:false});
const output=Type.Object({status:Type.String(),data:Type.Optional(Type.Unknown()),problems:Type.Optional(Type.Array(Type.Object({code:Type.String(),path:Type.String(),message:Type.String()}))),message:Type.Optional(Type.String()),candidateUrl:Type.Optional(Type.String())},{additionalProperties:false});
const operations:Array<Operation|GithubOperation>=['gh_issue_validate','gh_issue_preview','gh_issue_submit','gh_labels_validate','gh_labels_preview','gh_labels_apply','gh_issue_form',...githubReads,...githubWrites];
const repo=Type.String({minLength:3});
const issueRead=Type.Object({repo,issue:Type.Integer({minimum:1})},{additionalProperties:false});
const issueList=Type.Object({repo,state:Type.Optional(Type.Union([Type.Literal('open'),Type.Literal('closed'),Type.Literal('all')])),labels:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:50}),{minItems:1,maxItems:10}))},{additionalProperties:false});
const projectRead=Type.Object({projectId:Type.String({pattern:'^PVT_[A-Za-z0-9_-]+$'})},{additionalProperties:false});
const labelsRead=Type.Object({repo},{additionalProperties:false});
function identity(ctx:ExtensionToolContext){return ctx.sessionManager.getSessionId()+':'+ctx.sessionManager.getLeafId();}
function render(result:OperationResult){
 const safe=safeResult(result),full=JSON.stringify(safe),limit=32768;
 return {content:[{type:'text' as const,text:full.length<=limit?full:full.slice(0,limit)+'\n[truncated; complete masked data in structuredContent]'}],details:safe,structuredContent:safe as never,isError:['rejected','not-started','unknown'].includes(safe.status)};
}
export function registerTools(pi:ExtensionAPI,scope:RuntimeScope,packageRoot:string){
 pi.registerTool({name:'gh_capabilities',label:'GitHub capabilities',description:'Return pi-gh tool contract version and supported operations. No remote access.',parameters:Type.Object({},{additionalProperties:false}),outputSchema:output,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},async execute(){return render({status:'read',data:{contractVersion:1,operations:[...operations,'gh_capabilities'],features:['issue-list-labels']}});}});
 for(const name of operations){
  const write=name==='gh_issue_submit'||name==='gh_labels_apply'||(githubWrites as readonly string[]).includes(name);
  pi.registerTool({
   name,label:name,description:write?'Preview and apply one GitHub change after local human approval or an exact owner-configured permission grant. Never auto-retries unknown outcomes.':'Validate or preview a GitHub workflow. Preview may read remote metadata; never changes GitHub.',
   parameters:(githubWrites as readonly string[]).includes(name)?labels:(githubReads as readonly string[]).includes(name)?(name==='gh_issue_list'?issueList:name==='gh_labels_list'?labelsRead:name.startsWith('gh_project_')?projectRead:issueRead):name.startsWith('gh_labels_')?labels:name==='gh_issue_form'?form:issue,outputSchema:output,
   exposure:'direct',executionMode:write?'sequential':'parallel',
   annotations:{readOnlyHint:!write,destructiveHint:write,idempotentHint:!write,openWorldHint:name!=='gh_issue_validate'&&name!=='gh_labels_validate'&&name!=='gh_issue_form'},
   async execute(_id,args,signal,_update,ctx){
    const captured=identity(ctx),lease=scope.acquire(signal),isCurrent=()=>scope.isCurrent(lease.stamp)&&identity(ctx)===captured;
    const work=async()=>{
     const child=!!process.env.PI_SUBAGENT_CHILD,headless=ctx.mode!=='tui'||!ctx.hasUI;
     const permissions=write?await loadPermissions(permissionPath(),{child,headless}):undefined;
     const context={
      cwd:ctx.cwd,packageRoot,interactive:!headless&&!child,permissions,signal:lease.signal,stamp:lease.stamp,isCurrent,
      confirm:(view:import('../src/service-types.js').ApprovalView)=>showApproval(view,{signal:lease.signal,isCurrent},ctx.ui)
     };
     return (githubReads as readonly string[]).includes(name)||(githubWrites as readonly string[]).includes(name)?runGithubOperation(name as GithubOperation,args as GithubArgs,context):runOperation(name as Operation,args as IssueArgs|LabelsArgs|FormArgs,context);
    };
    try{return render(write?await scope.runExclusive(work):await work());}
    catch(error){return render(errorResult(error));}
    finally{lease.dispose();}
   }
  });
 }
}
