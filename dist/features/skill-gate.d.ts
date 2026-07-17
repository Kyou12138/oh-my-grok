import type { EnvConfig, HookInput } from "../protocol/types.js";
export interface SkillMeta {
    id: string;
    name: string;
    path: string;
    description: string;
}
export interface SkillGateState {
    schemaVersion: 1;
    loaded: string[];
    catalog: SkillMeta[];
    updatedAt: string;
}
/**
 * Mutating tool ids — normalized to [a-z] only (drop _ - .).
 * Fixes v1.1.5: SearchReplace → searchreplace was missing while
 * search_replace (underscore kept under old [^a-z_] norm) hit the set.
 */
/**
 * Canonical mutating tool ids after normalizeToolName ([a-z] only).
 * Keep in sync with hooks.json PreTool/PostTool write matchers — see tests/hooks-matcher.test.ts.
 */
export declare const MUTATING_TOOL_IDS: readonly ["write", "writefile", "writetofile", "strreplace", "searchreplace", "strreplaceeditor", "replaceinfile", "replacestringinfile", "editnotebook", "notebookedit", "delete", "deletefile", "deletepath", "removefile", "rmfile", "edit", "editfile", "fileedit", "create", "createfile", "createorupdatefile", "overwritefile", "savefile", "updatefile", "patchfile", "insert", "insertfile", "append", "appendfile", "applypatch", "multiedit"];
/** Normalize tool name for mutating / matcher checks. */
export declare function normalizeToolName(name: string): string;
export declare function isMutatingTool(name?: string): boolean;
export declare function scanSkillCatalog(pluginRoot: string): SkillMeta[];
export declare function loadSkillGateState(input: HookInput, cfg: EnvConfig): SkillGateState;
export declare function saveSkillGateState(input: HookInput, cfg: EnvConfig, state: SkillGateState): void;
export declare function refreshCatalog(input: HookInput, cfg: EnvConfig): SkillGateState;
/** Host Skill / load_skill tool names (letters-only). v1.1.43 */
export declare function isSkillLoadTool(toolName?: string): boolean;
/** Register a catalog skill id/name as loaded (idempotent). */
export declare function markSkillLoadedById(input: HookInput, cfg: EnvConfig, skillId: string): SkillGateState;
/**
 * Skill tool / Skill.md path → mark gate unlocked.
 * Hosts may load skills without Read(SKILL.md); without this, Skill Gate hard-denies forever.
 */
export declare function markSkillFromToolCall(input: HookInput, cfg: EnvConfig): SkillGateState;
export declare function markSkillLoaded(input: HookInput, cfg: EnvConfig, filePath: string): SkillGateState;
export declare function suggestedSkillsForContext(catalog: SkillMeta[], context: string): SkillMeta[];
export declare function skillGateDenyReason(state: SkillGateState, context?: string): string | null;
export declare function skillGateReminder(state: SkillGateState, context?: string): string;
