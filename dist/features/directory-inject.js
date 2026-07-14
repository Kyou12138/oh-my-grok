/**
 * Walk from a file up to workspace root collecting AGENTS.md / README snippets.
 */
import fs from "node:fs";
import path from "node:path";
const MAX = 6_000;
/** Realpath with fallback to path.normalize for missing/error paths. */
function safeRealpath(p) {
    try {
        return fs.realpathSync.native(p);
    }
    catch {
        return path.normalize(p);
    }
}
/** Check if child is inside or equal to parent (canonical paths). */
function isInside(child, parent) {
    const rel = path.relative(parent, child);
    return !rel.startsWith("..");
}
/** Truncate at a code-point boundary (not UTF-16 code unit) to keep UTF-8 well-formed. */
function truncateByCodePoints(str, max) {
    if (/^[\x00-\x7F]*$/.test(str))
        return str.slice(0, max); // ASCII fast path
    return Array.from(str).slice(0, max).join("");
}
export function collectDirectoryContext(workspaceRoot, filePath) {
    if (!filePath || !workspaceRoot)
        return "";
    const abs = path.isAbsolute(filePath)
        ? path.normalize(filePath)
        : path.normalize(path.join(workspaceRoot, filePath));
    let dir = fs.existsSync(abs) && fs.statSync(abs).isFile() ? path.dirname(abs) : abs;
    const root = path.normalize(workspaceRoot);
    const rootReal = safeRealpath(root);
    const chunks = [];
    let guard = 0;
    while (guard++ < 32) {
        // Containment: never read AGENTS.md from outside the workspace root.
        // Realpath-aware check prevents symlink bypass/leak.
        const dirReal = safeRealpath(dir);
        if (!isInside(dirReal, rootReal))
            break;
        for (const name of ["AGENTS.md", "agents.md"]) {
            const f = path.join(dir, name);
            if (fs.existsSync(f)) {
                try {
                    const body = truncateByCodePoints(fs.readFileSync(f, "utf8"), 2000);
                    chunks.push(`### ${path.relative(root, f) || name}\n${body}`);
                }
                catch {
                    /* */
                }
                break;
            }
        }
        if (path.normalize(dir) === root)
            break;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        // stop if left workspace (realpath-aware)
        const parentReal = safeRealpath(parent);
        if (!isInside(parentReal, rootReal))
            break;
        dir = parent;
    }
    if (!chunks.length)
        return "";
    let text = chunks.join("\n\n");
    if (text.length > MAX)
        text = truncateByCodePoints(text, MAX) + "\n…[truncated]";
    return `<OMG_DIR_AGENTS>\nNearby AGENTS.md for context:\n${text}\n</OMG_DIR_AGENTS>`;
}
//# sourceMappingURL=directory-inject.js.map