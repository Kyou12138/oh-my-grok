/**
 * Collect target paths from tool input (single-file + MultiEdit batches).
 * Grok/Claude may pass path under path / file_path / target_file, or
 * nested edits[] / files[] for MultiEdit — single-path gates must not miss these.
 */
export function pathsFromToolInput(toolInput) {
    if (!toolInput || typeof toolInput !== "object")
        return [];
    const out = [];
    const push = (v) => {
        if (typeof v === "string" && v.trim())
            out.push(v.trim());
    };
    push(toolInput.file_path);
    push(toolInput.path);
    push(toolInput.filePath);
    push(toolInput.target_file);
    push(toolInput.targetFile);
    push(toolInput.filename);
    push(toolInput.file);
    const batches = [toolInput.edits, toolInput.files, toolInput.operations, toolInput.changes];
    for (const batch of batches) {
        if (!Array.isArray(batch))
            continue;
        for (const item of batch) {
            if (!item || typeof item !== "object")
                continue;
            const o = item;
            push(o.file_path);
            push(o.path);
            push(o.filePath);
            push(o.target_file);
            push(o.targetFile);
            push(o.filename);
            push(o.file);
        }
    }
    // de-dupe preserve order
    const seen = new Set();
    const uniq = [];
    for (const p of out) {
        const key = p.replace(/\\/g, "/").toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        uniq.push(p);
    }
    return uniq;
}
//# sourceMappingURL=tool-paths.js.map