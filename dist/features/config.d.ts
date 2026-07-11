import type { EnvConfig } from "../protocol/types.js";
/** Optional workspace file: <workspace>/.omg/config.json */
export interface OmgFileConfig {
    schemaVersion?: number;
    skillGate?: boolean;
    intentGate?: boolean;
    planMode?: boolean;
    hashline?: boolean;
    diagEnforce?: boolean;
    hardOrchestration?: boolean;
    maxRalphIter?: number;
    todoCooldownMs?: number;
    diagCommand?: string;
    diagTimeoutMs?: number;
    hashlineTtlMs?: number;
    stateDir?: string;
}
/**
 * Base config from env, then overlay .omg/config.json (workspace wins for toggles).
 */
export declare function loadConfig(workspaceRoot?: string): EnvConfig;
/** @deprecated use loadConfig */
export declare function readEnvConfig(): EnvConfig;
