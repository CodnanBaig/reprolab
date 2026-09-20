import { HttpError } from './validation';
export interface SourceMap {
    version: 3;
    sources: string[];
    names: string[];
    mappings: string;
    sourcesContent?: (string | null)[];
}
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function decodeVLQ(segment: string): number[] {
    const values: number[] = [];
    let value = 0, shift = 0;
    for (const c of segment) {
        const digit = chars.indexOf(c);
        if (digit < 0 || shift > 30)
            throw new HttpError(400, 'Invalid source map mappings.');
        value += (digit & 31) * 2 ** shift;
        if (digit & 32)
            shift += 5;
        else {
            values.push(value & 1 ? -(value >> 1) : value >> 1);
            value = 0;
            shift = 0;
        }
    }
    if (shift)
        throw new HttpError(400, 'Truncated source map mapping.');
    return values;
}
export function parseSourceMap(v: unknown): SourceMap {
    const m = v as Partial<SourceMap>;
    if (!m || m.version !== 3 || !Array.isArray(m.sources) || m.sources.length > 5000 || !m.sources.every(x => typeof x === 'string' && x.length < 1000) || !Array.isArray(m.names) || !m.names.every(x => typeof x === 'string') || typeof m.mappings !== 'string' || m.mappings.length > 1800000)
        throw new HttpError(400, 'Use a flat v3 source map (indexed maps are not supported).');
    if (m.sourcesContent !== undefined && (!Array.isArray(m.sourcesContent) || !m.sourcesContent.every(x => x === null || typeof x === 'string')))
        throw new HttpError(400, 'Invalid source contents.');
    return m as SourceMap;
}
export function originalPosition(map: SourceMap, line: number, column: number) {
    let source = 0, originalLine = 0, originalColumn = 0, name = 0;
    const lines = map.mappings.split(';');
    let result: {
        source: string;
        line: number;
        column: number;
        name: string | null;
        context: string | null;
    } | null = null;
    for (let i = 0; i < Math.min(line, lines.length); i++) {
        let generatedColumn = 0;
        for (const segment of (lines[i] ?? '').split(',')) {
            if (!segment)
                continue;
            const fields = decodeVLQ(segment);
            generatedColumn += fields[0] ?? 0;
            if (fields.length === 1)
                continue;
            if (fields.length !== 4 && fields.length !== 5)
                throw new HttpError(400, 'Invalid mapping segment.');
            source += fields[1] ?? 0;
            originalLine += fields[2] ?? 0;
            originalColumn += fields[3] ?? 0;
            if (fields.length === 5)
                name += fields[4] ?? 0;
            if (i === line - 1 && generatedColumn <= column - 1 && map.sources[source]) {
                const content = map.sourcesContent?.[source];
                result = { source: map.sources[source]!, line: originalLine + 1, column: originalColumn + 1, name: fields.length === 5 ? map.names[name] ?? null : null, context: content?.split('\n').slice(Math.max(0, originalLine - 1), originalLine + 2).join('\n') ?? null };
            }
        }
    }
    return result;
}
