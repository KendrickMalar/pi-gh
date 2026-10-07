import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { loadTemplate } from '../../src/core/template.js';
import { fixture, template, policy } from '../helpers.js';
test('loads shared YAML and rereads changed labels and profiles', async (t) => { const f = await fixture(t); const b = await loadTemplate(f.path); assert.equal(b.template.fields[0]?.label, '目的'); assert.equal(b.policy.agents.coder?.[0]?.thinking, 'xhigh'); await writeFile(f.path, stringify({ ...template, fields: [{ ...template.fields[0], label: '変更後' }] })); const changed = await loadTemplate(f.path); assert.equal(changed.template.fields[0]?.label, '変更後'); });
for (const [name, edit] of [
    ['unknown template key', { ...template, command: 'evil' }],
    ['duplicate field ID', { ...template, fields: [template.fields[0], template.fields[0]] }],
    ['unknown field type', { ...template, fields: [{ ...template.fields[0], type: 'javascript' }] }],
    ['outside reference', { ...template, modelPolicy: '../outside.yml' }],
    ['invalid bound', { ...template, fields: [{ ...template.fields[0], minLength: -1 }] }],
    ['wrong template version', { ...template, version: 2 }]
] as const)
    test('rejects ' + name, async (t) => { const f = await fixture(t); await writeFile(f.path, stringify(edit)); await assert.rejects(loadTemplate(f.path)); });
for (const [name, content] of [['duplicate keys', stringify(template) + '\nid: replacement\n'], ['multiple documents', stringify(template) + '\n---\na: b\n'], ['custom tag', '!execute anything'], ['recursive alias', 'a: &a [*a]'], ['large input', 'x'.repeat(1048577)]] as const)
    test('rejects YAML ' + name, async (t) => { const f = await fixture(t); await writeFile(f.path, content); await assert.rejects(loadTemplate(f.path)); });
test('rejects policy symlink outside template root', async (t) => { const f = await fixture(t); const outside = await fixture(t); await writeFile(join(outside.dir, 'external.yml'), stringify(policy)); await symlink(join(outside.dir, 'external.yml'), join(f.dir, 'escape.yml')); await writeFile(f.path, stringify({ ...template, modelPolicy: 'escape.yml' })); await assert.rejects(loadTemplate(f.path)); });
test('rejects unsupported thinking and duplicate policy combinations', async (t) => { const f = await fixture(t); for (const profiles of [[{ ...policy.agents.coder![0], thinking: 'ultra' }], [policy.agents.coder![0], policy.agents.coder![0]]]) {
    await writeFile(join(f.dir, 'models.yml'), stringify({ version: 1, agents: { coder: profiles } }));
    await assert.rejects(loadTemplate(f.path));
} });
