import type { Criterion, ValidatedIssue } from './types.js';
export function renderIssue(issue: ValidatedIssue): {
    repo: string;
    title: string;
    body: string;
} {
    const { draft: d, bundle: { template: t } } = issue;
    const blocks: string[] = [];
    if (d.parentIssue !== undefined)
        blocks.push('## 親Issue\n\nhttps://github.com/' + d.repo + '/issues/' + d.parentIssue);
    for (const f of t.fields) {
        const v = d.fields[f.id];
        if (v === undefined)
            continue;
        let content: string;
        if (f.type === 'criteria')
            content = (v as Criterion[]).map(c => '- [ ] ' + c.id + ': ' + c.requirement + '\n  - 検証: ' + c.verification + '\n  - 期待結果: ' + c.expectedResult).join('\n');
        else if (Array.isArray(v))
            content = (v as string[]).map(s => '- ' + s).join('\n');
        else
            content = v;
        blocks.push('## ' + f.label + '\n\n' + content);
    }
    blocks.push('## 担当モデル\n\n' + t.agents.map(name => { const a = d.agents[name]!; return '- ' + name + ': `' + a.model + '` / `' + a.thinking + '`\n  - 選定理由: ' + a.reason + (a.upperTierApproval ? '\n  - 上位利用承認: ' + a.upperTierApproval : ''); }).join('\n'));
    return { repo: d.repo, title: d.title, body: (blocks.join('\n\n') + '\n').replace(/\r\n?/g, '\n') };
}
