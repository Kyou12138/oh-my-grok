import type { EnvConfig } from "../protocol/types.js";
/** Truncate at code-point boundary (CJK/emoji safe). */
export declare function truncateRulesText(str: string, max: number): string;
/** Read plugin version from package.json (fingerprint / alive banner). */
export declare function readPluginVersion(pluginRoot: string): string;
export declare function loadInjectedRules(workspaceRoot: string, cfg: EnvConfig): string;
export declare function sisyphusBootstrap(): string;
export declare function usingSuperpowersHint(pluginRoot: string): string;
