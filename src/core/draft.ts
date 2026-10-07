import { capture, parseJson, record, keys, nonblank, fail, DataError } from './data.js';
import type { CapturedInput, Criterion, Draft, FieldDefinition, TemplateBundle, ValidatedIssue, ValidationProblem } from './types.js';
import { validateLabelNames } from './labels-input.js';
export async function loadDraft(path: string): Promise<CapturedInput> { return capture(path); }
function string(value: unknown, f: FieldDefinition, path: string) {
    if (!nonblank(value))
        fail('FIELD_REQUIRED', path, 'Expected nonblank text.');
    if (f.type === 'string' && /[\r\n]/.test(value))
        fail('FIELD_SINGLE_LINE', path, 'Expected a single line.');
    const n = Array.from(value).length;
    if ((f.minLength !== undefined && n < f.minLength) || (f.maxLength !== undefined && n > f.maxLength))
        fail('FIELD_LENGTH', path, 'Text length is outside allowed range.');
    if (f.options && !f.options.includes(value))
        fail('FIELD_OPTION', path, 'Value is not an allowed option.');
}
function field(value: unknown, f: FieldDefinition) {
    if (['string', 'text'].includes(f.type)) {
        string(value, f, 'fields.' + f.id);
        return;
    }
    if (!Array.isArray(value) || (f.required && !value.length) || (f.minItems !== undefined && value.length < f.minItems) || (f.maxItems !== undefined && value.length > f.maxItems))
        fail('FIELD_ITEMS', 'fields.' + f.id, 'Invalid list size or type.');
    if (f.type === 'string-list') {
        for (const v of value)
            string(v, { ...f, type: 'text' }, 'fields.' + f.id);
        return;
    }
    const seen = new Set<string>();
    for (const v of value) {
        if (!record(v))
            fail('CRITERION_INVALID', 'fields.' + f.id, 'Criterion must be an object.');
        keys(v, ['id', 'requirement', 'verification', 'expectedResult'], 'fields.' + f.id);
        for (const k of ['id', 'requirement', 'verification', 'expectedResult'])
            if (!nonblank(v[k]))
                fail('CRITERION_REQUIRED', 'fields.' + f.id, 'All criterion attributes are required.');
        const id = v.id as string;
        if (seen.has(id))
            fail('CRITERION_DUPLICATE', 'fields.' + f.id, 'Duplicate criterion ID.');
        seen.add(id);
    }
}
export function validateDraft(input: CapturedInput, bundle: TemplateBundle): {
    issue?: ValidatedIssue;
    problems: ValidationProblem[];
} {
    try {
        const value = parseJson(input.bytes);
        const t = bundle.template;
        if (!record(value))
            fail('DRAFT_TYPE', '', 'Draft must be an object.');
        keys(value, ['version', 'template', 'repo', 'title', 'parentIssue', 'labels', 'fields', 'agents'], 'draft');
        if (value.version !== 1 || value.template !== t.id)
            fail('DRAFT_TEMPLATE', 'template', 'Draft template does not match.');
        if (typeof value.repo !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}\/[a-zA-Z0-9_.][a-zA-Z0-9_.-]{0,99}$/.test(value.repo) || value.repo.endsWith('/.') || value.repo.endsWith('/..'))
            fail('DRAFT_REPO', 'repo', 'Expected OWNER/REPO.');
        if (!nonblank(value.title) || /[\r\n\u0000-\u001f\u007f]/.test(value.title) || Array.from(value.title).length > 256)
            fail('DRAFT_TITLE', 'title', 'Expected a nonblank single-line title up to 256 characters.');
        if (value.labels !== undefined) validateLabelNames(value.labels);
        if (t.kind === 'task' && (!Number.isSafeInteger(value.parentIssue) || (value.parentIssue as number) < 1))
            fail('DRAFT_PARENT', 'parentIssue', 'A positive parent issue is required.');
        if (t.kind === 'parent' && value.parentIssue !== undefined)
            fail('DRAFT_PARENT', 'parentIssue', 'Parent issue must not specify a parent.');
        if (!record(value.fields))
            fail('DRAFT_FIELDS', 'fields', 'Fields must be an object.');
        keys(value.fields, t.fields.map(f => f.id), 'fields');
        for (const f of t.fields) {
            const present = Object.hasOwn(value.fields, f.id);
            if (!present && !f.required)
                continue;
            field(present ? value.fields[f.id] : undefined, f);
        }
        if (!record(value.agents))
            fail('DRAFT_AGENTS', 'agents', 'Agents must be an object.');
        keys(value.agents, t.agents, 'agents');
        for (const agent of t.agents) {
            const a = Object.hasOwn(value.agents, agent) ? value.agents[agent] : undefined;
            if (!record(a))
                fail('AGENT_REQUIRED', 'agents.' + agent, 'Agent assignment is required.');
            keys(a, ['model', 'thinking', 'reason', 'upperTierApproval'], 'agents.' + agent);
            if (!nonblank(a.model) || !nonblank(a.thinking) || !nonblank(a.reason))
                fail('AGENT_REQUIRED', 'agents.' + agent, 'Model, thinking and reason are required.');
            const profile = bundle.policy.agents[agent]?.find(p => p.model === a.model && p.thinking === a.thinking);
            if (!profile)
                fail('AGENT_PROFILE', 'agents.' + agent, 'Model/thinking combination is not allowed for this agent.');
            if (profile.tier === 'upper' && !nonblank(a.upperTierApproval))
                fail('AGENT_APPROVAL', 'agents.' + agent, 'Upper profile requires an approval record.');
            if (a.upperTierApproval !== undefined && !nonblank(a.upperTierApproval))
                fail('AGENT_APPROVAL', 'agents.' + agent, 'Approval record must be nonblank.');
        }
        return { issue: { draft: value as Draft, bundle, draftInput: input }, problems: [] };
    }
    catch (e) {
        return { problems: [e instanceof DataError ? { code: e.code, path: e.field, message: e.message } : { code: 'INPUT_INVALID', path: '', message: 'Invalid input.' }] };
    }
}
