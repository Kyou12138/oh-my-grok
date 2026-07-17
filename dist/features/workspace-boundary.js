import { isTargetInside } from "../state/path-boundary.js";
import { pathsFromToolInput } from "./tool-paths.js";
export function isWorkspaceWritePath(input, file) {
    if (!file?.trim())
        return false;
    const root = (input.workspaceRoot || input.cwd || "").trim();
    if (!root)
        return false;
    return isTargetInside({
        baseDir: root,
        boundary: root,
        target: file,
    });
}
/**
 * PreTool deny when any resolvable path leaves the workspace.
 * Pathless calls return null (Hashline / plan-mode handle empty path).
 */
export function workspaceBoundaryDeny(input) {
    const root = (input.workspaceRoot || input.cwd || "").trim();
    if (!root)
        return null;
    const paths = pathsFromToolInput(input.toolInput);
    if (!paths.length)
        return null;
    const blocked = paths.filter((file) => !isWorkspaceWritePath(input, file));
    if (!blocked.length)
        return null;
    return [
        "[WORKSPACE_BOUNDARY] Path escapes workspace — write denied.",
        `Workspace: ${root}`,
        `Blocked path: ${blocked[0]}${blocked.length > 1 ? ` (+${blocked.length - 1} more)` : ""}`,
        "How to fix: use a path under the project root (no `../` escape, no foreign absolute path).",
    ].join("\n");
}
//# sourceMappingURL=workspace-boundary.js.map