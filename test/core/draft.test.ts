import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import { loadTemplate } from '../../src/core/template.js';
import { validateDraft, loadDraft } from '../../src/core/draft.js';
import { fixture, draft, input, template } from '../helpers.js';
test('valid task keeps requirements and agents', async (t) => { const f = await fixture(t); const b = await loadTemplate(f.path); const result = validateDraft(input(draft()), b); assert.deepEqual(result.problems, []); assert.equal(result.issue?.draft.parentIssue, 10); assert.equal(result.issue?.draft.agents.coder?.thinking, 'xhigh'); });
const bad: [
    string,
    (d: ReturnType<typeof draft>) => unknown
][] = [
    ['missing required field', d => ({ ...d, fields: { criteria: d.fields.criteria } })],
    ['blank purpose', d => ({ ...d, fields: { ...d.fields, purpose: '  ' } })],
    ['missing criterion verification', d => ({ ...d, fields: { ...d.fields, criteria: [{ id: 'C1', requirement: 'R', expectedResult: 'E' }] } })],
    ['missing parent', d => ({ ...d, parentIssue: undefined })],
    ['bad repo', d => ({ ...d, repo: '--repo=evil/repo' })],
    ['multiline title', d => ({ ...d, title: 'a\nb' })],
    ['unknown field', d => ({ ...d, fields: { ...d.fields, secretField: 'x' } })],
    ['unknown top-level key', d => ({ ...d, arbitrary: true })],
    ['unlisted profile', d => ({ ...d, agents: { coder: { ...d.agents.coder, thinking: 'medium' } } })],
    ['upper without approval', d => ({ ...d, agents: { coder: { model: 'openai-codex/gpt-6.1-sol', thinking: 'medium', reason: '理由' } } })],
    ['wrong agent', d => ({ ...d, agents: { tester: d.agents.coder } })],
    ['empty criteria', d => ({ ...d, fields: { ...d.fields, criteria: [] } })]
];
for (const [name, edit] of bad)
    test('rejects ' + name, async (t) => { const f = await fixture(t); const b = await loadTemplate(f.path); const result = validateDraft(input(edit(draft())), b); assert.ok(result.problems.length > 0); assert.equal(result.issue, undefined); });
test('changed required flag and options take effect without code edits', async (t) => { const f = await fixture(t); const d = draft(); d.fields.purpose = 'different'; await writeFile(f.path, stringify({ ...template, fields: [{ ...template.fields[0], options: ['only'], required: true }] })); assert.ok(validateDraft(input({ ...d, fields: { purpose: 'different' } }), await loadTemplate(f.path)).problems.length); await writeFile(f.path, stringify({ ...template, fields: [{ ...template.fields[0], required: false }] })); assert.ok(validateDraft(input({ ...d, fields: {} }), await loadTemplate(f.path)).issue); });
test('JSON duplicate keys including escaped names are refused', async (t) => { const f = await fixture(t); const b = await loadTemplate(f.path); for (const json of ['{"a":1,"a":2}', '{"fields":{"a":1,"\\u0061":2}}'])
    assert.ok(validateDraft({ path: '/synthetic', bytes: Buffer.from(json) }, b).problems.length); });
test('parent template accepts a parent and refuses parentIssue', async (t) => { const f = await fixture(t); await writeFile(f.path, stringify({ ...template, kind: 'parent', id: 'parent' })); const b = await loadTemplate(f.path); const d = { ...draft(), template: 'parent', parentIssue: undefined }; assert.ok(validateDraft(input(d), b).issue); assert.ok(validateDraft(input({ ...d, parentIssue: 10 }), b).problems.length); });
test('large and deep JSON are refused and error values are not exposed', async (t) => { const f = await fixture(t); const b = await loadTemplate(f.path); for (const text of [' '.repeat(1048577), '['.repeat(40) + '0' + ']'.repeat(40), '{"hidden":"password=very-secret-token",']) {
    const out = validateDraft({ path: 'test', bytes: Buffer.from(text) }, b);
    assert.ok(out.problems.length);
    assert.ok(!JSON.stringify(out.problems).includes('very-secret-token'));
} await writeFile(f.path, 'x'.repeat(1048577)); await assert.rejects(loadDraft(f.path)); });

test('optional draft labels accept comma and Unicode as individual names', async t => { const f = await fixture(t); const b = await loadTemplate(f.path); const r = validateDraft(input({ ...draft(), labels: ['a,b', '優先 / high'] }), b); assert.deepEqual(r.problems, []); assert.deepEqual((r.issue?.draft as unknown as {labels: string[]}).labels, ['a,b', '優先 / high']); });
