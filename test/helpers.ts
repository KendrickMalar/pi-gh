import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import type { TemplateDefinition, ModelPolicy, Draft, CapturedInput } from '../src/core/types.js';
export const template: TemplateDefinition = { version: 1, id: 'task', name: 'Task', description: 'Implementation task', kind: 'task', modelPolicy: 'models.yml', agents: ['coder'], fields: [{ id: 'purpose', label: '目的', type: 'text', required: true }, { id: 'criteria', label: '受け入れ要件', type: 'criteria', required: true, minItems: 1 }] };
export const policy: ModelPolicy = { version: 1, agents: { coder: [{ model: 'openai-codex/gpt-6-luna', thinking: 'xhigh', tier: 'basic' }, { model: 'openai-codex/gpt-6.1-sol', thinking: 'medium', tier: 'upper' }] } };
export function draft(): Draft { return { version: 1, template: 'task', repo: 'example/demo', title: '検索機能を実装', parentIssue: 10, fields: { purpose: '検索を追加', criteria: [{ id: 'C1', requirement: '検索結果を表示', verification: '画面で確認', expectedResult: '一致する結果だけ表示' }] }, agents: { coder: { model: 'openai-codex/gpt-6-luna', thinking: 'xhigh', reason: '基本構成' } } }; }
export function input(value: unknown): CapturedInput { return { path: '/synthetic/draft.json', bytes: Buffer.from(JSON.stringify(value)) }; }
export async function fixture(t: {
    after: (fn: () => Promise<void>) => void;
}) { const dir = await mkdtemp(join(tmpdir(), 'issueflow-test-')); t.after(() => rm(dir, { recursive: true, force: true })); const path = join(dir, 'task.yml'); await writeFile(path, stringify(template)); await writeFile(join(dir, 'models.yml'), stringify(policy)); return { dir, path }; }
