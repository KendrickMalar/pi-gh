import { dirname, resolve, isAbsolute } from 'node:path';
import { capture, parseYaml, record, keys, nonblank, validId, fail } from './data.js';
import type { FieldDefinition, ModelPolicy, TemplateBundle, TemplateDefinition } from './types.js';
const thinking = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const fieldKeys = ['id', 'label', 'type', 'required', 'description', 'options', 'minLength', 'maxLength', 'minItems', 'maxItems'];
function field(value: unknown): FieldDefinition {
    if (!record(value))
        fail('FIELD_TYPE', 'fields', 'Field must be an object.');
    keys(value, fieldKeys, 'fields');
    if (!validId(value.id) || !nonblank(value.label) || (typeof value.type !== 'string' || !['string', 'text', 'string-list', 'criteria'].includes(value.type)) || typeof value.required !== 'boolean')
        fail('FIELD_INVALID', 'fields', 'Invalid field definition.');
    if (value.description !== undefined && !nonblank(value.description))
        fail('FIELD_INVALID', 'fields', 'Description must be nonblank.');
    for (const k of ['minLength', 'maxLength', 'minItems', 'maxItems'])
        if (value[k] !== undefined && (!Number.isSafeInteger(value[k]) || (value[k] as number) < 0 || (value[k] as number) > 1048576))
            fail('FIELD_BOUND', 'fields', 'Invalid bound.');
    if (value.minLength !== undefined && value.maxLength !== undefined && (value.minLength as number) > (value.maxLength as number))
        fail('FIELD_BOUND', 'fields', 'Invalid length range.');
    if (value.minItems !== undefined && value.maxItems !== undefined && (value.minItems as number) > (value.maxItems as number))
        fail('FIELD_BOUND', 'fields', 'Invalid item range.');
    const list = ['string-list', 'criteria'].includes(value.type as string);
    if (!list && (value.minItems !== undefined || value.maxItems !== undefined))
        fail('FIELD_BOUND', 'fields', 'Item bounds require a list.');
    if (value.type === 'criteria' && (value.options !== undefined || value.minLength !== undefined || value.maxLength !== undefined))
        fail('FIELD_BOUND', 'fields', 'Criteria use item bounds only.');
    if (value.options !== undefined && (!Array.isArray(value.options) || !value.options.length || !value.options.every(nonblank) || new Set(value.options).size !== value.options.length))
        fail('FIELD_OPTIONS', 'fields', 'Invalid options.');
    return value as FieldDefinition;
}
function definition(value: unknown): TemplateDefinition {
    if (!record(value))
        fail('TEMPLATE_INVALID', '', 'Template must be an object.');
    keys(value, ['version', 'id', 'name', 'description', 'kind', 'fields', 'agents', 'modelPolicy'], 'template');
    if (value.version !== 1 || !validId(value.id) || !nonblank(value.name) || !nonblank(value.description) || (typeof value.kind !== 'string' || !['parent', 'task'].includes(value.kind)) || !nonblank(value.modelPolicy))
        fail('TEMPLATE_INVALID', '', 'Invalid template metadata.');
    if (!Array.isArray(value.fields) || !value.fields.length)
        fail('TEMPLATE_FIELDS', 'fields', 'At least one field is required.');
    const fields = value.fields.map(field);
    if (new Set(fields.map(f => f.id)).size !== fields.length)
        fail('FIELD_DUPLICATE', 'fields', 'Duplicate field IDs.');
    if (!Array.isArray(value.agents) || !value.agents.length || !value.agents.every(validId) || new Set(value.agents).size !== value.agents.length)
        fail('TEMPLATE_AGENTS', 'agents', 'Invalid agent list.');
    return { ...value, fields } as TemplateDefinition;
}
function policy(value: unknown): ModelPolicy {
    if (!record(value))
        fail('POLICY_INVALID', '', 'Policy must be an object.');
    keys(value, ['version', 'agents'], 'policy');
    if (value.version !== 1 || !record(value.agents) || !Object.keys(value.agents).length)
        fail('POLICY_INVALID', 'agents', 'Invalid model policy.');
    for (const [agent, profiles] of Object.entries(value.agents)) {
        if (!validId(agent) || !Array.isArray(profiles) || !profiles.length)
            fail('POLICY_AGENT', 'agents', 'Invalid agent profiles.');
        const seen = new Set<string>();
        for (const p of profiles) {
            if (!record(p))
                fail('POLICY_PROFILE', 'agents', 'Profile must be an object.');
            keys(p, ['model', 'thinking', 'tier'], 'agents');
            if (!nonblank(p.model) || !/^[^\s/]+\/[^\s]+$/.test(p.model) || typeof p.thinking !== 'string' || !thinking.includes(p.thinking) || typeof p.tier !== 'string' || !['basic', 'upper'].includes(p.tier))
                fail('POLICY_PROFILE', 'agents', 'Invalid profile.');
            const key = JSON.stringify([p.model, p.thinking]);
            if (seen.has(key))
                fail('POLICY_DUPLICATE', 'agents', 'Duplicate profile.');
            seen.add(key);
        }
    }
    return value as ModelPolicy;
}
export async function loadTemplate(file: string): Promise<TemplateBundle> {
    const input = await capture(file);
    const t = definition(parseYaml(input.bytes));
    const root = dirname(input.path);
    if (isAbsolute(t.modelPolicy) || t.modelPolicy.includes('://') || t.modelPolicy.startsWith('~'))
        fail('POLICY_PATH', '', 'Policy must be a local relative path.');
    const policyInput = await capture(resolve(root, t.modelPolicy), root);
    const p = policy(parseYaml(policyInput.bytes));
    for (const agent of t.agents)
        if (!Object.hasOwn(p.agents, agent))
            fail('POLICY_MISSING', 'agents', 'Template agent has no policy.');
    return { template: t, policy: p, inputs: [input, policyInput] };
}
