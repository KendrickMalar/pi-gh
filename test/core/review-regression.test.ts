import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stringify } from 'yaml';
import { loadTemplate } from '../../src/core/template.js';
import { validateDraft } from '../../src/core/draft.js';
import { createPreview } from '../../src/core/approval.js';
import { submitIssue } from '../../src/core/submit.js';
import { fixture, template, policy, draft, input } from '../helpers.js';
test('GH_HOST cannot change the approved github.com destination', async (t) => {
    const f = await fixture(t), gh = join(f.dir, 'gh'), record = join(f.dir, 'record.json');
    await fs.copyFile(fileURLToPath(new URL('../../../test/fake-gh.mjs', import.meta.url)), gh);
    await fs.chmod(gh, 0o755);
    const saved = { host: process.env.GH_HOST, record: process.env.FAKE_GH_RECORD, mode: process.env.FAKE_GH_MODE };
    process.env.GH_HOST = 'enterprise.example';
    process.env.FAKE_GH_RECORD = record;
    process.env.FAKE_GH_MODE = 'ok';
    t.after(async () => { for (const [k, v] of [['GH_HOST', saved.host], ['FAKE_GH_RECORD', saved.record], ['FAKE_GH_MODE', saved.mode]] as const) {
        if (v === undefined)
            delete process.env[k];
        else
            process.env[k] = v;
    } });
    const issue = validateDraft(input(draft()), await loadTemplate(f.path)).issue!;
    assert.equal((await submitIssue(issue, createPreview(issue).digest, { ghExecutable: gh })).status, 'created');
    const sent = JSON.parse(await fs.readFile(record, 'utf8')) as {
        args: string[];
        host: string;
    };
    assert.equal(sent.args[2], '--repo=github.com/example/demo');
    assert.equal(sent.host, 'github.com');
});
test('array enum values cannot bypass upper approval, task parent or field semantics', async (t) => {
    const f = await fixture(t);
    for (const value of [{ ...template, kind: ['task'] }, { ...template, fields: [{ ...template.fields[0], type: ['text'] }] }]) {
        await fs.writeFile(f.path, stringify(value));
        await assert.rejects(loadTemplate(f.path));
    }
    await fs.writeFile(f.path, stringify(template));
    for (const value of [{ ...policy.agents.coder![1], tier: ['upper'] }, { ...policy.agents.coder![0], thinking: ['xhigh'] }]) {
        await fs.writeFile(join(f.dir, 'models.yml'), stringify({ version: 1, agents: { coder: [value] } }));
        await assert.rejects(loadTemplate(f.path));
    }
});
test('policy swapped to outside symlink after realpath is rejected before capture', async (t) => {
    const f = await fixture(t), outside = await fixture(t), target = join(await fs.realpath(f.dir), 'models.yml'), external = join(outside.dir, 'models.yml');
    const original = fs.realpath;
    let swapped = false;
    fs.realpath = (async (p: string) => { const answer = await original(p); if (p === target && !swapped) {
        swapped = true;
        await fs.rename(target, join(f.dir, 'old-models.yml'));
        await fs.symlink(external, target);
    } return answer; }) as typeof fs.realpath;
    syncBuiltinESMExports();
    t.after(async () => { fs.realpath = original; syncBuiltinESMExports(); });
    await assert.rejects(loadTemplate(f.path));
    assert.equal(swapped, true);
});
test('policy parent directory swapped to outside symlink is rejected', async (t) => {
    const f = await fixture(t), outside = await fixture(t), folder = join(await fs.realpath(f.dir), 'policies'), target = join(folder, 'models.yml');
    await fs.mkdir(folder);
    await fs.writeFile(target, stringify(policy));
    await fs.writeFile(f.path, stringify({ ...template, modelPolicy: 'policies/models.yml' }));
    const original = fs.realpath;
    let swapped = false;
    fs.realpath = (async (p: string) => { const answer = await original(p); if (p === target && !swapped) {
        swapped = true;
        await fs.rename(folder, join(f.dir, 'old-policies'));
        await fs.symlink(outside.dir, folder);
    } return answer; }) as typeof fs.realpath;
    syncBuiltinESMExports();
    t.after(async () => { fs.realpath = original; syncBuiltinESMExports(); });
    await assert.rejects(loadTemplate(f.path));
    assert.equal(swapped, true);
});
test('fine-grained GitHub PAT is masked and cannot be submitted', async (t) => {
    const f = await fixture(t), d = draft(), secret = 'github_pat_' + 'A'.repeat(82);
    d.fields.purpose = secret;
    const issue = validateDraft(input(d), await loadTemplate(f.path)).issue!, p = createPreview(issue);
    assert.equal(p.sensitive, true);
    assert.ok(!JSON.stringify(p).includes(secret));
    assert.equal((await submitIssue(issue, p.digest, { ghExecutable: join(f.dir, 'not-called') })).status, 'rejected');
});
test('timeout returns unknown even when an exited wrapper leaves a descendant holding pipes', async (t) => {
    const f = await fixture(t), gh = join(f.dir, 'gh'), record = join(f.dir, 'record.json');
    await fs.copyFile(fileURLToPath(new URL('../../../test/fake-gh.mjs', import.meta.url)), gh);
    await fs.chmod(gh, 0o755);
    const oldRecord = process.env.FAKE_GH_RECORD, oldMode = process.env.FAKE_GH_MODE;
    process.env.FAKE_GH_RECORD = record;
    process.env.FAKE_GH_MODE = 'retained';
    t.after(async () => { try {
        const entry = JSON.parse(await fs.readFile(record, 'utf8')) as {
            descendantPid: number;
        };
        process.kill(entry.descendantPid, 'SIGKILL');
    }
    catch { } if (oldRecord === undefined)
        delete process.env.FAKE_GH_RECORD;
    else
        process.env.FAKE_GH_RECORD = oldRecord; if (oldMode === undefined)
        delete process.env.FAKE_GH_MODE;
    else
        process.env.FAKE_GH_MODE = oldMode; });
    const issue = validateDraft(input(draft()), await loadTemplate(f.path)).issue!;
    let guard: NodeJS.Timeout | undefined;
    const guardPromise = new Promise<{
        status: 'did-not-settle';
    }>(resolve => { guard = setTimeout(() => resolve({ status: 'did-not-settle' }), 900); });
    const pending = submitIssue(issue, createPreview(issue).digest, { ghExecutable: gh, timeoutMs: 150 });
    const result = await Promise.race([pending, guardPromise]);
    clearTimeout(guard);
    if (result.status === 'did-not-settle') {
        const entry = JSON.parse(await fs.readFile(record, 'utf8')) as {
            descendantPid: number;
        };
        try {
            process.kill(entry.descendantPid, 'SIGKILL');
        }
        catch { }
        await pending;
    }
    assert.equal(result.status, 'unknown');
});
test('diagnostic paths and preview agent keys never expose a detected token', async (t) => {
    const f = await fixture(t), secret = 'ghp_' + 'A'.repeat(30), d = draft();
    await fs.writeFile(f.path, stringify({ ...template, fields: [{ ...template.fields[0], id: secret }] }));
    const file = join(f.dir, 'draft.json');
    await fs.writeFile(file, JSON.stringify({ ...d, fields: {} }));
    const cli = fileURLToPath(new URL('../core-driver.js', import.meta.url)), out = spawnSync(process.execPath, [cli, 'validate', file, '--template', f.path], { encoding: 'utf8' });
    assert.equal(out.status, 2);
    assert.ok(!out.stderr.includes(secret));
    await fs.writeFile(f.path, stringify({ ...template, agents: [secret] }));
    await fs.writeFile(join(f.dir, 'models.yml'), stringify({ version: 1, agents: { [secret]: policy.agents.coder } }));
    const changed = { ...d, agents: { [secret]: d.agents.coder } }, issue = validateDraft(input(changed), await loadTemplate(f.path)).issue!, p = createPreview(issue);
    assert.equal(p.sensitive, true);
    assert.ok(!JSON.stringify(p).includes(secret));
});
