export type Profile = {
    model: string;
    thinking: string;
    tier: 'basic' | 'upper';
};
export type AgentAssignment = {
    model: string;
    thinking: string;
    reason: string;
    upperTierApproval?: string;
};
export type Criterion = {
    id: string;
    requirement: string;
    verification: string;
    expectedResult: string;
};
export type FieldDefinition = {
    id: string;
    label: string;
    type: 'string' | 'text' | 'string-list' | 'criteria';
    required: boolean;
    description?: string;
    options?: string[];
    minLength?: number;
    maxLength?: number;
    minItems?: number;
    maxItems?: number;
};
export type TemplateDefinition = {
    version: 1;
    id: string;
    name: string;
    description: string;
    kind: 'parent' | 'task';
    fields: FieldDefinition[];
    agents: string[];
    modelPolicy: string;
};
export type ModelPolicy = {
    version: 1;
    agents: Record<string, Profile[]>;
};
export type Draft = {
    version: 1;
    template: string;
    repo: string;
    title: string;
    labels?: string[];
    parentIssue?: number;
    fields: Record<string, string | string[] | Criterion[]>;
    agents: Record<string, AgentAssignment>;
};
export type CapturedInput = {
    path: string;
    bytes: Buffer;
};
export type TemplateBundle = {
    template: TemplateDefinition;
    policy: ModelPolicy;
    inputs: CapturedInput[];
};
export type ValidationProblem = {
    code: string;
    path: string;
    message: string;
};
export type ValidatedIssue = {
    draft: Draft;
    bundle: TemplateBundle;
    draftInput: CapturedInput;
};
export type Preview = {
    repo: string;
    title: string;
    body: string;
    agents: Draft['agents'];
    labels?: string[];
    digest: string;
    sensitive: boolean;
};
export type SubmitOutcome = {
    status: 'created';
    url: string;
} | {
    status: 'rejected';
    problems: ValidationProblem[];
} | {
    status: 'not-started';
    message: string;
} | {
    status: 'unknown';
    message: string;
    candidateUrl?: string;
};
