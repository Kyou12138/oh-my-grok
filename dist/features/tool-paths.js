/**
 * Collect target paths from tool input (single-file + MultiEdit batches + apply_patch).
 * Grok/Claude may pass path under path / file_path / target_file, or
 * nested edits[] / files[] for MultiEdit — single-path gates must not miss these.
 */
/** Paths from apply_patch / V4A-style patch bodies (*** Update File: …). */
export function pathsFromApplyPatchText(text) {
    if (!text?.trim())
        return [];
    const out = [];
    const re = /^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s*(.+?)\s*$/gim;
    let m;
    while ((m = re.exec(text)) !== null) {
        const p = m[1].trim().replace(/^["']|["']$/g, "");
        if (p)
            out.push(p);
    }
    // *** Move to: path / *** Rename to:
    const moveRe = /^\*\*\*\s+(?:Move|Rename)\s+to:\s*(.+?)\s*$/gim;
    while ((m = moveRe.exec(text)) !== null) {
        const p = m[1].trim().replace(/^["']|["']$/g, "");
        if (p)
            out.push(p);
    }
    return out;
}
/**
 * New content snippets for comment-checker / scan gates.
 * Covers single Write/StrReplace and MultiEdit edits[].
 */
export function contentSnippetsFromToolInput(toolInput) {
    if (!toolInput || typeof toolInput !== "object")
        return [];
    const out = [];
    const pushSnippet = (filePath, content) => {
        if (typeof content !== "string" || !content)
            return;
        out.push({ filePath: filePath || "", content });
    };
    const topPath = String(toolInput.file_path ??
        toolInput.path ??
        toolInput.filePath ??
        toolInput.target_file ??
        toolInput.targetFile ??
        "");
    const topContent = toolInput.contents ??
        toolInput.content ??
        toolInput.new_string ??
        toolInput.newString ??
        toolInput.new_str ??
        toolInput.replace;
    if (typeof topContent === "string" && topContent) {
        pushSnippet(topPath, topContent);
    }
    const batches = [toolInput.edits, toolInput.files, toolInput.operations, toolInput.changes];
    for (const batch of batches) {
        if (!Array.isArray(batch))
            continue;
        for (const item of batch) {
            if (!item || typeof item !== "object")
                continue;
            const o = item;
            const fp = String(o.file_path ?? o.path ?? o.filePath ?? o.target_file ?? o.targetFile ?? "");
            const c = o.contents ??
                o.content ??
                o.new_string ??
                o.newString ??
                o.new_str ??
                o.replace;
            pushSnippet(fp, c);
        }
    }
    // apply_patch: scan whole patch as one blob (paths still from pathsFromApplyPatchText)
    const patch = toolInput.patch ?? toolInput.diff ?? toolInput.input;
    if (typeof patch === "string" && patch.includes("***") && !out.length) {
        pushSnippet("", patch);
    }
    return out;
}
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
    // apply_patch / ApplyPatch: path lives inside patch body
    const patch = toolInput.patch ?? toolInput.diff ?? toolInput.input;
    if (typeof patch === "string") {
        for (const p of pathsFromApplyPatchText(patch))
            push(p);
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