/**
 * Workspace write boundary — mutating tools may not escape workspaceRoot via ../ or abs paths.
 * Uses shared path-boundary (realpath + ancestor rebuild). Independent of Hashline on/off.
 */
import type { HookInput } from "../protocol/types.js";
export declare function isWorkspaceWritePath(input: HookInput, file: string): boolean;
/**
 * PreTool deny when any resolvable path leaves the workspace.
 * Pathless calls return null (Hashline / plan-mode handle empty path).
 */
export declare function workspaceBoundaryDeny(input: HookInput): string | null;
