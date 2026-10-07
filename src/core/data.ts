import { open, realpath, stat as pathStat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { parseAllDocuments, isAlias, isMap, isSeq } from 'yaml';
import type { CapturedInput } from './types.js';
export type ParsedData = null | boolean | number | string | ParsedData[] | { [key: string]: ParsedData };
export const MAX_BYTES = 1048576;
export class DataError extends Error {
    constructor(public readonly code: string, public readonly field: string, message: string) { super(message); this.name = 'DataError'; }
}
export function fail(code: string, field: string, message: string): never { throw new DataError(code, field, message); }
export function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function keys(value: Record<string, unknown>, allowed: readonly string[], field: string) {
    for (const k of Object.keys(value))
        if (!allowed.includes(k))
            fail('UNKNOWN_KEY', field, 'Unknown property.');
}
export function nonblank(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
export function validId(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value); }
export async function capture(file: string, allowedRoot?: string): Promise<CapturedInput> {
    let handle;
    try {
        const path = await realpath(resolve(file));
        const contained = (candidate: string) => {
            if (!allowedRoot)
                return;
            const rel = relative(allowedRoot, candidate);
            if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
                fail('POLICY_OUTSIDE', '', 'Policy resolves outside template directory.');
        };
        contained(path);
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        const before = await handle.stat();
        if (!before.isFile())
            fail('INPUT_TYPE', '', 'Input must be a regular file.');
        if (before.size > MAX_BYTES)
            fail('INPUT_LIMIT', '', 'Input exceeds 1 MiB.');
        const verifyLocation = async () => {
            if (allowedRoot && await realpath(allowedRoot) !== allowedRoot)
                fail('INPUT_CHANGED', '', 'Template root changed during capture.');
            const currentPath = await realpath(resolve(file));
            contained(currentPath);
            if (currentPath !== path)
                fail('INPUT_CHANGED', '', 'Input location changed during capture.');
            const current = await pathStat(currentPath);
            if (current.dev !== before.dev || current.ino !== before.ino)
                fail('INPUT_CHANGED', '', 'Input identity changed during capture.');
        };
        await verifyLocation(); // Validate the opened descriptor before reading bytes.
        const bytes = Buffer.alloc(MAX_BYTES + 1);
        let length = 0;
        while (length < bytes.length) {
            const part = await handle.read(bytes, length, bytes.length - length, null);
            if (!part.bytesRead)
                break;
            length += part.bytesRead;
        }
        if (length > MAX_BYTES)
            fail('INPUT_LIMIT', '', 'Input exceeds 1 MiB.');
        await verifyLocation();
        const after = await handle.stat();
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs)
            fail('INPUT_CHANGED', '', 'Input changed during capture.');
        return { path, bytes: Buffer.from(bytes.subarray(0, length)) };
    }
    catch (e) {
        if (e instanceof DataError)
            throw e;
        return fail('INPUT_READ', '', 'Unable to read input file.');
    }
    finally {
        await handle?.close();
    }
}
export function text(bytes: Buffer): string {
    if (bytes.length > MAX_BYTES)
        fail('INPUT_LIMIT', '', 'Input exceeds 1 MiB.');
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch {
        fail('ENCODING', '', 'Input must be UTF-8.');
    }
}
export function parseYaml(bytes: Buffer): ParsedData {
    try {
        const docs = parseAllDocuments(text(bytes), { uniqueKeys: true, prettyErrors: false, strict: true });
        if (docs.length !== 1)
            fail('YAML_DOCUMENT', '', 'Exactly one YAML document is required.');
        const doc = docs[0]!;
        if (doc.errors.length || doc.warnings.length)
            fail('YAML_INVALID', '', 'Invalid YAML or duplicate keys.');
        const stack: {
            node: unknown;
            depth: number;
        }[] = [{ node: doc.contents, depth: 0 }];
        const tags = new Set(['tag:yaml.org,2002:str', 'tag:yaml.org,2002:int', 'tag:yaml.org,2002:float', 'tag:yaml.org,2002:bool', 'tag:yaml.org,2002:null', 'tag:yaml.org,2002:map', 'tag:yaml.org,2002:seq']);
        while (stack.length) {
            const { node, depth } = stack.pop()!;
            if (depth > 32)
                fail('INPUT_DEPTH', '', 'Input nesting exceeds 32.');
            if (isAlias(node))
                fail('YAML_ALIAS', '', 'YAML aliases are not supported.');
            if (record(node) && typeof node.tag === 'string' && !tags.has(node.tag))
                fail('YAML_TAG', '', 'Custom YAML tags are not supported.');
            if (isMap(node))
                for (const pair of node.items) {
                    stack.push({ node: pair.key, depth: depth + 1 }, { node: pair.value, depth: depth + 1 });
                }
            else if (isSeq(node))
                for (const item of node.items)
                    stack.push({ node: item, depth: depth + 1 });
        }
        return doc.toJS({ maxAliasCount: 0 }) as ParsedData;
    }
    catch (e) {
        if (e instanceof DataError)
            throw e;
        fail('YAML_INVALID', '', 'Invalid YAML.');
    }
}
export function parseJson(bytes: Buffer): ParsedData {
    try {
        const raw = text(bytes);
        const value: unknown = JSON.parse(raw);
        parseYaml(bytes); // JSON syntax is a YAML subset; detect decoded duplicate keys.
        return value as ParsedData;
    }
    catch (e) {
        if (e instanceof DataError)
            throw e;
        fail('JSON_INVALID', '', 'Invalid JSON.');
    }
}
