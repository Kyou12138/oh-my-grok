/**
 * Collect target paths from tool input (single-file + MultiEdit batches).
 * Grok/Claude may pass path under path / file_path / target_file, or
 * nested edits[] / files[] for MultiEdit — single-path gates must not miss these.
 */
export declare function pathsFromToolInput(toolInput?: Record<string, unknown> | null): string[];
