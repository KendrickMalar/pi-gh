import { stringify } from 'yaml';
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fail, DataError } from './data.js';
import type { TemplateBundle } from './types.js';
type FormField = {
    type: 'markdown' | 'input' | 'textarea' | 'dropdown';
    id?: string;
    attributes: {
        value?: string;
        label?: string;
        description?: string;
        options?: string[];
        multiple?: boolean;
    };
    validations?: {
        required: boolean;
    };
};
export function renderForm(bundle: TemplateBundle): string {
    const { template: t, policy: p } = bundle, body: FormField[] = [{ type: 'markdown', attributes: { value: 'このフォームは共通YAMLから生成されています。CLIの全検査（担当別の条件・上位承認等）をGitHub上で強制するものではありません。モデル利用承認と投稿承認を別途確認してください。' } }];
    const ids = new Set<string>();
    const add = (f: FormField) => { if (f.id) {
        if (ids.has(f.id))
            fail('FORM_ID_COLLISION', '', 'Generated form IDs collide.');
        ids.add(f.id);
    } body.push(f); };
    if (t.kind === 'task')
        add({ type: 'input', id: 'parent-issue', attributes: { label: '親Issue', description: '同じrepositoryの親Issue番号' }, validations: { required: true } });
    for (const f of t.fields) {
        const id = 'field-' + f.id.toLowerCase();
        let type: FormField['type'] = f.type === 'string' ? 'input' : 'textarea';
        if (f.options)
            type = 'dropdown';
        add({ type, id, attributes: { label: f.label, ...(f.description ? { description: f.description } : {}), ...(f.options ? { options: f.options, ...(f.type === 'string-list' ? { multiple: true } : {}) } : {}),
                ...(!f.options && ['string-list', 'criteria'].includes(f.type) ? { description: (f.description ?? '') + '\nJSON配列で入力してください。criteriaの各要素: id, requirement, verification, expectedResult。' } : {}) }, validations: { required: f.required } });
    }
    for (const agent of t.agents) {
        const prefix = 'agent-' + agent.toLowerCase(), profiles = p.agents[agent]!;
        add({ type: 'dropdown', id: prefix + '-profile', attributes: { label: agent + ' モデル / thinking', options: profiles.map(x => x.model + ' / ' + x.thinking + ' (' + x.tier + ')') }, validations: { required: true } });
        add({ type: 'textarea', id: prefix + '-reason', attributes: { label: agent + ' 選定理由' }, validations: { required: true } });
        if (profiles.some(x => x.tier === 'upper'))
            add({ type: 'textarea', id: prefix + '-approval', attributes: { label: agent + ' 上位利用の承認記録', description: 'upperを選ぶ場合はユーザー承認の参照・説明が必要。basicの場合は不要。' }, validations: { required: false } });
    }
    return stringify({ name: t.name, description: t.description, body });
}
export async function writeForm(path: string, content: string, overwrite = false): Promise<void> {
    let handle;
    try {
        handle = await open(path, overwrite ? constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        if (!(await handle.stat()).isFile())
            fail('OUTPUT_TYPE', '', 'Output must be a regular file.');
        if (overwrite)
            await handle.truncate(0);
        await handle.writeFile(content, 'utf8');
        await handle.sync();
    }
    catch (e) {
        if (e instanceof DataError)
            throw e;
        fail('OUTPUT_WRITE', '', 'Cannot write output; existing files need --overwrite and symlinks are refused.');
    }
    finally {
        await handle?.close();
    }
}
