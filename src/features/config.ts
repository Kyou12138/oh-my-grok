import fs from "node:fs";
import path from "node:path";
import type { EnvConfig } from "../protocol/types.js";
import { readJson } from "../state/fs.js";

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

function envBool(name: string, defaultOn: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return defaultOn;
  return v !== "0" && v.toLowerCase() !== "false";
}

function envNum(name: string, fallback: number): number {
  const n = Number(process.env[name] || "");
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Base config from env, then overlay .omg/config.json (workspace wins for toggles).
 */
export function loadConfig(workspaceRoot?: string): EnvConfig {
  const home =
    process.env.GROK_HOME || process.env.USERPROFILE || process.env.HOME || "";
  const pluginRoot = process.env.GROK_PLUGIN_ROOT || process.cwd();
  const pluginData =
    process.env.GROK_PLUGIN_DATA ||
    (home
      ? `${home.replace(/\\/g, "/")}/.grok/state/oh-my-grok`
      : `${pluginRoot}/.omg-plugin-data`);

  let file: OmgFileConfig = {};
  const stateDirName = process.env.OMG_STATE_DIR || ".omg";
  if (workspaceRoot) {
    const cfgPath = path.isAbsolute(stateDirName)
      ? path.join(stateDirName, "config.json")
      : path.join(workspaceRoot, stateDirName, "config.json");
    if (fs.existsSync(cfgPath)) {
      file = readJson<OmgFileConfig>(cfgPath, {});
    }
  }

  return {
    pluginRoot,
    pluginData,
    grokHome: home ? `${home.replace(/\\/g, "/")}/.grok` : "",
    stateDirName: file.stateDir || stateDirName,
    skillGate: file.skillGate ?? envBool("OMG_SKILL_GATE", true),
    intentGate: file.intentGate ?? envBool("OMG_INTENT_GATE", true),
    planMode: file.planMode ?? envBool("OMG_PLAN_MODE", true),
    hashline: file.hashline ?? envBool("OMG_HASHLINE", true),
    diagEnforce: file.diagEnforce ?? envBool("OMG_DIAG_ENFORCE", true),
    hardOrchestration: file.hardOrchestration ?? envBool("OMG_HARD_ORCH", true),
    maxRalphIter: file.maxRalphIter ?? envNum("OMG_MAX_RALPH_ITER", 50),
    todoCooldownMs: file.todoCooldownMs ?? envNum("OMG_TODO_COOLDOWN_MS", 5000),
    todoAbortWindowMs: envNum("OMG_TODO_ABORT_WINDOW_MS", 3000),
    diagCommand: (
      file.diagCommand ??
      process.env.OMG_DIAG_CMD ??
      ""
    ).trim(),
    diagTimeoutMs: file.diagTimeoutMs ?? envNum("OMG_DIAG_TIMEOUT_MS", 60000),
    hashlineTtlMs: file.hashlineTtlMs ?? envNum("OMG_HASHLINE_TTL_MS", 30 * 60 * 1000),
  };
}

/** @deprecated use loadConfig */
export function readEnvConfig(): EnvConfig {
  return loadConfig(process.env.GROK_WORKSPACE_ROOT || process.cwd());
}
