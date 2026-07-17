import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface HashlineFileCache {
    path: string;
    contentHash: string;
    mtimeMs: number;
    lineCount: number;
    /** short line tags: index 0 unused, 1..n */
    lineTags: string[];
    /** first lines for context inject (capped) */
    annotatedPreview: string;
    readAt: number;
}
export interface HashlineState {
    schemaVersion: 1;
    files: Record<string, HashlineFileCache>;
}
export declare function loadHashline(input: HookInput, cfg: EnvConfig): HashlineState;
export declare function saveHashline(input: HookInput, cfg: EnvConfig, state: HashlineState): void;
/** Short stable tag like omo LINE#ID (2 base36-ish chars). */
export declare function lineTag(line: string): string;
export declare function contentHash(text: string): string;
export declare function annotateLines(text: string, maxLines?: number): {
    tags: string[];
    annotated: string;
    lineCount: number;
};
export declare function recordRead(input: HookInput, cfg: EnvConfig, filePath: string): HashlineFileCache | null;
export declare function getCached(input: HookInput, cfg: EnvConfig, filePath: string): HashlineFileCache | undefined;
/**
 * Strip display prefixes from old_string before disk match:
 * - Hashline anchors: `N#TAG| body`
 * - Grok read_file: `N→body` / `N->body` (agents often paste tool output into old_string)
 * - Editor style: `L12: body`
 */
export declare function stripHashlinePrefixes(text: string): string;
/** CRLF/CR → LF for old_string↔disk comparison (v1.1.34). */
export declare function normalizeNewlines(text: string): string;
/**
 * True if needle appears in haystack, allowing LF vs CRLF mismatch.
 * Exact match first; then newline-normalized (Windows paste false-stale fix).
 */
export declare function contentIncludes(haystack: string, needle: string): boolean;
export declare function hashlinePreToolDeny(input: HookInput, cfg: EnvConfig): string | null;
export declare function hashlineUserContext(input: HookInput, cfg: EnvConfig): string;
