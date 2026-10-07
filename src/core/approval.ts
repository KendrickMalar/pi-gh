import { createHash } from 'node:crypto';
import { renderIssue } from './render.js';
import { maskSecrets } from './secrets.js';
import type { Preview, ValidatedIssue, AgentAssignment } from './types.js';
function canonical(value: unknown): string {
    if (Array.isArray(value))
        return '[' + value.map(canonical).join(',') + ']';
    if (typeof value === 'object' && value !== null)
        return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
    return JSON.stringify(value);
}
export function createPreview(issue: ValidatedIssue): Preview {
    const rendered = renderIssue(issue);
    const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
    const digest = sha(canonical({ formatVersion: 1, host: 'github.com', ...rendered, agents: issue.draft.agents, inputs: [issue.draftInput, ...issue.bundle.inputs].map(i => ({ path: i.path, sha256: sha(i.bytes) })) }));
    let sensitive = false;
    const mask = (v: string) => { const m = maskSecrets(v); sensitive ||= m.sensitive; return m.text; };
    for (const i of [issue.draftInput, ...issue.bundle.inputs])
        mask(i.bytes.toString('utf8'));
    const agents: Record<string, AgentAssignment> = {};
    for (const [name, a] of Object.entries(issue.draft.agents))
        agents[mask(name)] = { model: mask(a.model), thinking: mask(a.thinking), reason: mask(a.reason), ...(a.upperTierApproval === undefined ? {} : { upperTierApproval: mask(a.upperTierApproval) }) };
    const title = mask(rendered.title), body = mask(rendered.body), repo = mask(rendered.repo);
    const labels = issue.draft.labels?.map(mask);
    return { repo, title, body, agents, digest, sensitive, ...(labels === undefined ? {} : { labels }) };
}
