/**
 * Collect target paths from tool input (single-file + MultiEdit batches + apply_patch).
 * Grok/Claude may pass path under path / file_path / target_file, or
 * nested edits[] / files[] for MultiEdit — single-path gates must not miss these.
 */
/** Paths from apply_patch / V4A-style patch bodies (*** Update File: …). */
export declare function pathsFromApplyPatchText(text: string): string[];
export interface ToolContentSnippet {
    filePath: string;
    content: string;
}
/**
 * New content snippets for comment-checker / scan gates.
 * Covers single Write/StrReplace and MultiEdit edits[].
 */
export declare function contentSnippetsFromToolInput(toolInput?: Record<string, unknown> | null): ToolContentSnippet[];
export declare function pathsFromToolInput(toolInput?: Record<string, unknown> | null): string[];
