const patterns = [
    /\b(?:sk_live_[a-zA-Z0-9_-]{8,}|sk-[a-zA-Z0-9_-]{16,}|(?:gh[pousr]_[a-zA-Z0-9]{16,}|github_pat_[a-zA-Z0-9_]{20,})|xox[baprs]-[a-zA-Z0-9-]{8,})\b/g,
    /\bBearer\s+[a-zA-Z0-9._~+\/-]{12,}=*/gi,
    /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret|authorization)\s*["']?\s*[:=]\s*["']?(?!\s*(?:\$|<|placeholder|example|changeme|your[_-]))[a-zA-Z0-9_./+=:-]{8,}/gi
];
export function maskSecrets(value: string): {
    text: string;
    sensitive: boolean;
} {
    let text = value, sensitive = false;
    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        text = text.replace(pattern, () => { sensitive = true; return '[REDACTED]'; });
    }
    return { text, sensitive };
}

type SecretValue = null | undefined | boolean | number | string | SecretValue[] | { [key: string]: SecretValue };
/** Inspect decoded JSON values before serialization so escaping cannot hide a candidate. */
export function maskDecodedSecrets<T>(value: T): { value: T; sensitive: boolean } {
    let sensitive = false;
    const mask = (text: string) => {
        const result = maskSecrets(text);
        sensitive ||= result.sensitive;
        return result.text;
    };
    const visit = (item: unknown): SecretValue => {
        if (typeof item === 'string') return mask(item);
        if (Array.isArray(item)) return item.map(visit);
        if (item !== null && typeof item === 'object')
            return Object.fromEntries(Object.entries(item).map(([key, child]) => [mask(key), visit(child)]));
        if (item === null || item === undefined || typeof item === 'number' || typeof item === 'boolean') return item;
        throw new TypeError('Secret inspection expects decoded data.');
    };
    const masked = visit(value) as T;
    return { value: masked, sensitive };
}
