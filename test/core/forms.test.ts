import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, symlink, access } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { loadTemplate } from '../../src/core/template.js';
import { renderForm, writeForm } from '../../src/core/forms.js';
import { fixture, template } from '../helpers.js';
test('generates fields and combined agent profiles from shared YAML', async (t) => { const f = await fixture(t); const form = parse(renderForm(await loadTemplate(f.path))) as {
    name: string;
    body: {
        id?: string;
        type: string;
        attributes: {
            label?: string;
            options?: string[];
        };
        validations?: {
            required: boolean;
        };
    }[];
}; assert.equal(form.name, 'Task'); const purpose = form.body.find(x => x.id === 'field-purpose'); assert.equal(purpose?.type, 'textarea'); assert.equal(purpose?.validations?.required, true); assert.deepEqual(form.body.find(x => x.id === 'agent-coder-profile')?.attributes.options, ['openai-codex/gpt-6-luna / xhigh (basic)', 'openai-codex/gpt-6.1-sol / medium (upper)']); assert.ok(renderForm(await loadTemplate(f.path)).includes('CLI')); });
test('form updates options and detects normalized ID collisions', async (t) => { const f = await fixture(t); await writeFile(f.path, stringify({ ...template, fields: [{ ...template.fields[0], type: 'string', options: ['A', 'B'] }] })); const form = renderForm(await loadTemplate(f.path)); assert.ok(form.includes('dropdown')); assert.ok(form.includes('A')); await writeFile(f.path, stringify({ ...template, fields: [{ ...template.fields[0], id: 'Choice' }, { ...template.fields[0], id: 'choice' }] })); const bundle = await loadTemplate(f.path); assert.throws(() => renderForm(bundle)); });
test('write refuses overwrite and symlink and requires existing parent directory', async (t) => { const f = await fixture(t); const out = join(f.dir, 'form.yml'); await writeForm(out, 'first'); assert.equal(await readFile(out, 'utf8'), 'first'); await assert.rejects(writeForm(out, 'second')); assert.equal(await readFile(out, 'utf8'), 'first'); await writeForm(out, 'second', true); assert.equal(await readFile(out, 'utf8'), 'second'); const link = join(f.dir, 'link.yml'); await symlink(out, link); await assert.rejects(writeForm(link, 'evil', true)); assert.equal(await readFile(out, 'utf8'), 'second'); await assert.rejects(writeForm(join(f.dir, 'absent', 'form.yml'), 'x')); await assert.rejects(access(join(f.dir, 'absent'))); });
