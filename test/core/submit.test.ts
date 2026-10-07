import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, copyFile, readFile, access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitIssue } from '../../src/core/submit.js';
import { createPreview } from '../../src/core/approval.js';
import { loadTemplate } from '../../src/core/template.js';
import { validateDraft } from '../../src/core/draft.js';
import { renderIssue } from '../../src/core/render.js';
import { fixture, draft, input } from '../helpers.js';
async function setup(t: {
    after: (fn: () => Promise<void>) => void;
}, mode = 'ok') { const f = await fixture(t); const gh = join(f.dir, 'gh'); await copyFile(fileURLToPath(new URL('../../../test/fake-gh.mjs', import.meta.url)), gh); await chmod(gh, 0o755); const oldMode = process.env.FAKE_GH_MODE, oldRecord = process.env.FAKE_GH_RECORD; process.env.FAKE_GH_MODE = mode; process.env.FAKE_GH_RECORD = join(f.dir, 'record.json'); t.after(async () => { if (oldMode === undefined)
    delete process.env.FAKE_GH_MODE;
else
    process.env.FAKE_GH_MODE = oldMode; if (oldRecord === undefined)
    delete process.env.FAKE_GH_RECORD;
else
    process.env.FAKE_GH_RECORD = oldRecord; }); const issue = validateDraft(input(draft()), await loadTemplate(f.path)).issue!; return { ...f, gh, issue, record: join(f.dir, 'record.json') }; }
test('submits approved body via stdin with fixed arguments', async (t) => { const f = await setup(t); const p = createPreview(f.issue); const result = await submitIssue(f.issue, p.digest, { ghExecutable: f.gh }); assert.deepEqual(result, { status: 'created', url: 'https://github.com/example/demo/issues/123' }); const recorded = JSON.parse(await readFile(f.record, 'utf8')) as {
    args: string[];
    body: string;
}; assert.deepEqual(recorded.args, ['issue', 'create', '--repo=github.com/example/demo', '--title=検索機能を実装', '--body-file', '-']); assert.equal(recorded.body, renderIssue(f.issue).body); });
test('bad or missing approval never starts gh', async (t) => { const f = await setup(t); for (const hash of ['', 'A'.repeat(64), 'f'.repeat(64)])
    assert.equal((await submitIssue(f.issue, hash, { ghExecutable: f.gh })).status, 'rejected'); await assert.rejects(access(f.record)); });
test('secret candidate cannot be submitted', async (t) => { const f = await setup(t); const d = draft(); d.fields.purpose = 'password=abcdefghijk'; const issue = validateDraft(input(d), await loadTemplate(f.path)).issue!; const p = createPreview(issue); assert.equal((await submitIssue(issue, p.digest, { ghExecutable: f.gh })).status, 'rejected'); await assert.rejects(access(f.record)); });
test('input changed after capture cannot alter approved body', async (t) => { const f = await setup(t); const p = createPreview(f.issue); await writeFile(f.path, 'not the approved template'); const result = await submitIssue(f.issue, p.digest, { ghExecutable: f.gh }); assert.equal(result.status, 'created'); const recorded = JSON.parse(await readFile(f.record, 'utf8')) as {
    body: string;
}; assert.ok(recorded.body.includes('検索を追加')); assert.ok(!recorded.body.includes('not the approved')); });
test('shell-like title stays one title argument', async (t) => { const f = await setup(t); const d = draft(); d.title = '--label=admin $(echo wrong)'; f.issue = validateDraft(input(d), await loadTemplate(f.path)).issue!; assert.equal((await submitIssue(f.issue, createPreview(f.issue).digest, { ghExecutable: f.gh })).status, 'created'); const recorded = JSON.parse(await readFile(f.record, 'utf8')) as {
    args: string[];
}; assert.equal(recorded.args.length, 6); assert.equal(recorded.args[3], '--title=--label=admin $(echo wrong)'); });
for (const mode of ['error', 'wrong', 'none', 'multiple', 'huge', 'wait'])
    test('classifies ' + mode + ' as uncertain without retry', async (t) => { const f = await setup(t, mode); const out = await submitIssue(f.issue, createPreview(f.issue).digest, { ghExecutable: f.gh, timeoutMs: mode === 'wait' ? 150 : 2000, maxOutputBytes: mode === 'huge' ? 1024 : 1048576 }); assert.equal(out.status, 'unknown'); });
test('missing gh is not-started', async (t) => { const f = await setup(t); assert.equal((await submitIssue(f.issue, createPreview(f.issue).digest, { ghExecutable: join(f.dir, 'absent-gh') })).status, 'not-started'); });

test('process limits above safety bounds do not start gh', async t => { const f=await setup(t); const r=await submitIssue(f.issue,createPreview(f.issue).digest,{ghExecutable:f.gh,maxOutputBytes:1048577}); assert.equal(r.status,'not-started'); await assert.rejects(access(f.record)); });
