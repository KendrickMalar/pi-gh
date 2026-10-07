import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTemplate } from '../../src/core/template.js';
import { validateDraft } from '../../src/core/draft.js';
import { renderIssue } from '../../src/core/render.js';
import { fixture, input, draft } from '../helpers.js';
test('renders literal requirements, parent link and agent selection in order', async (t) => { const f = await fixture(t); const checked = validateDraft(input(draft()), await loadTemplate(f.path)); assert.ok(checked.issue); const result = renderIssue(checked.issue); assert.equal(result.repo, 'example/demo'); assert.equal(result.title, '検索機能を実装'); assert.ok(result.body.includes('https://github.com/example/demo/issues/10')); assert.ok(result.body.includes('## 目的\n\n検索を追加')); assert.ok(result.body.includes('画面で確認')); assert.ok(result.body.includes('一致する結果だけ表示')); assert.ok(result.body.includes('openai-codex/gpt-6-luna')); assert.ok(result.body.indexOf('## 目的') < result.body.indexOf('## 受け入れ要件')); });
