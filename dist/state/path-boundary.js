import fs from "node:fs";
import path from "node:path";
function pathEntryExists(file) {
    try {
        fs.lstatSync(file);
        return true;
    }
    catch (error) {
        const code = error.code;
        if (code === "ENOENT" || code === "ENOTDIR")
            return false;
        throw error;
    }
}
/** 解析最近存在祖先的真实路径，并保留尚未创建的尾部片段。 */
export function canonicalizeTargetPath(baseDir, target) {
    if (!baseDir.trim() || !target.trim())
        return null;
    try {
        const resolved = path.resolve(baseDir, target);
        const suffix = [];
        let cursor = resolved;
        while (!pathEntryExists(cursor)) {
            const parent = path.dirname(cursor);
            if (parent === cursor)
                return null;
            suffix.unshift(path.basename(cursor));
            cursor = parent;
        }
        const realAncestor = fs.realpathSync.native(cursor);
        return path.resolve(realAncestor, ...suffix);
    }
    catch {
        return null;
    }
}
/** 比较规范化绝对路径；不同盘符或 UNC 根产生绝对 relative，必须拒绝。 */
export function isPathInside(parent, candidate, pathFlavor = path) {
    if (!parent || !candidate)
        return false;
    const relative = pathFlavor.relative(parent, candidate);
    return (relative === "" ||
        (!pathFlavor.isAbsolute(relative) &&
            relative !== ".." &&
            !relative.startsWith(`..${pathFlavor.sep}`)));
}
export function isTargetInside(check) {
    const boundary = canonicalizeTargetPath(check.baseDir, check.boundary);
    const target = canonicalizeTargetPath(check.baseDir, check.target);
    return boundary !== null && target !== null && isPathInside(boundary, target);
}
//# sourceMappingURL=path-boundary.js.map