import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { createPreview } from '../../src/core/approval.js';
import { maskSecrets } from '../../src/core/secrets.js';
import { loadTemplate } from '../../src/core/template.js';
import { validateDraft } from '../../src/core/draft.js';
import { fixture, draft, input, policy } from '../helpers.js';
test('preview digest is deterministic and includes repo, title, body and raw input bytes', async (t) => { const f = await fixture(t); const b = await loadTemplate(f.path); const d = draft(); const a = validateDraft(input(d), b).issue!; const p = createPreview(a); assert.match(p.digest, /^[a-f0-9]{64}$/); assert.equal(createPreview(a).digest, p.digest); for (const changed of [{ ...d, repo: 'example/other' }, { ...d, title: '別のタイトル' }, { ...d, fields: { ...d.fields, purpose: '別の目的' } }, { ...d, agents: { coder: { ...d.agents.coder!, reason: '新しい理由' } } }])
    assert.notEqual(createPreview(validateDraft(input(changed), b).issue!).digest, p.digest); const whitespace = { ...input(d), bytes: Buffer.from(JSON.stringify(d, null, 2)) }; assert.notEqual(createPreview(validateDraft(whitespace, b).issue!).digest, p.digest); });
test('template and policy whitespace changes invalidate approval', async (t) => { const f = await fixture(t); const d = input(draft()); const before = createPreview(validateDraft(d, await loadTemplate(f.path)).issue!); await appendFile(f.path, '\n# changed\n'); const after = createPreview(validateDraft(d, await loadTemplate(f.path)).issue!); assert.notEqual(before.digest, after.digest); await appendFile(join(f.dir, 'models.yml'), '\n# changed policy\n'); assert.notEqual(after.digest, createPreview(validateDraft(d, await loadTemplate(f.path)).issue!).digest); });
test('upper approval is rendered and bound into digest', async (t) => { const f = await fixture(t); const d = draft(); d.agents.coder = { model: 'openai-codex/gpt-6.1-sol', thinking: 'medium', reason: '難しい検証', upperTierApproval: 'user-approved-request-1' }; const b = await loadTemplate(f.path); const a = createPreview(validateDraft(input(d), b).issue!); assert.ok(a.body.includes('user-approved-request-1')); d.agents.coder.upperTierApproval = 'user-approved-request-2'; assert.notEqual(a.digest, createPreview(validateDraft(input(d), b).issue!).digest); });
test('secret candidates are masked in preview title, body and agents', async (t) => { const f = await fixture(t); const d = draft(); d.title = 'password=very-secret-value'; d.fields.purpose = 'Bearer abcdefghijklmnopqrst'; d.agents.coder!.reason = 'ghp_' + 'A'.repeat(30); const p = createPreview(validateDraft(input(d), await loadTemplate(f.path)).issue!); assert.equal(p.sensitive, true); for (const token of ['very-secret-value', 'abcdefghijklmnopqrst', 'ghp_' + 'A'.repeat(30)])
    assert.ok(!JSON.stringify(p).includes(token)); });
for (const token of ['sk-' + 'A'.repeat(24), 'sk_live_' + 'A'.repeat(24), 'ghp_' + 'A'.repeat(24), 'xoxb-1234567890-abcdef', 'Bearer abcdefghijklmnop', 'password=abcdefghijk', 'client_secret: abcdefghijk'])
    test('masks secret format ' + token.slice(0, 4), () => { const masked = maskSecrets(token); assert.equal(masked.sensitive, true); assert.ok(!masked.text.includes(token)); });
