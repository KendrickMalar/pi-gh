import type {ValidationProblem} from './core/types.js';
export type Operation='gh_issue_validate'|'gh_issue_preview'|'gh_issue_submit'|'gh_labels_validate'|'gh_labels_preview'|'gh_labels_apply'|'gh_issue_form';
export type IssueArgs={draftPath:string;template?:'parent'|'task';templatePath?:string};
export type LabelsArgs={changePath:string};
export type FormArgs={template?:'parent'|'task';templatePath?:string};
export type ApprovalView={operation:Operation;text:string;digest:string};
export type OperationContext={cwd:string;packageRoot:string;interactive:boolean;signal:AbortSignal;stamp:string;isCurrent:()=>boolean;confirm:(view:ApprovalView)=>Promise<boolean>};
export type OperationResult={status:string;data?:unknown;problems?:ValidationProblem[];message?:string};
