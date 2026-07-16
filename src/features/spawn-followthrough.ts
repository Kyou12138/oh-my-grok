/**
 * Spawn follow-through / result recovery (v0.21, deepened v1.0).
 * After subagent spawn: Stop blocks when parent is idle or only announces spawn.
 * Up to MAX_YANKS per wave; re-arms on each new spawn.
 */
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { isIdleAssistantMessage } from "./idle-turn.js";

export const SPAWN_FOLLOWTHROUGH_MAX_YANKS = 2;

export interface SpawnFollowThroughState {
  schemaVersion: 2;
  /** Armed until progress or max yanks exhausted. */
  pending: boolean;
  lastRole?: string;
  /** How many times we blocked this wave. */
  yankCount: number;
  /** Host SubagentEnd fired — child done; parent still must integrate. */
  childFinished?: boolean;
  updatedAt: string;
}

function fileFor(input: HookInput, cfg: EnvConfig): string {
  return path.join(
    pathsFor(input.workspaceRoot, input.sessionId, cfg).session,
    "spawn-followthrough.json",
  );
}

function load(input: HookInput, cfg: EnvConfig): SpawnFollowThroughState {
  const raw = readJson<SpawnFollowThroughState & { schemaVersion?: number }>(
    fileFor(input, cfg),
    {
      schemaVersion: 2,
      pending: false,
      yankCount: 0,
      updatedAt: "",
    },
  );
  // migrate v1 → v2
  return {
    schemaVersion: 2,
    pending: !!raw.pending,
    lastRole: raw.lastRole,
    yankCount: typeof raw.yankCount === "number" ? raw.yankCount : 0,
    childFinished: !!raw.childFinished,
    updatedAt: raw.updatedAt || "",
  };
}

function save(input: HookInput, cfg: EnvConfig, st: SpawnFollowThroughState): void {
  writeJsonAtomic(fileFor(input, cfg), {
    ...st,
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
  });
}

/** PostTool spawn / SubagentStart — arm / re-arm follow-through for result recovery. */
export function markSpawnFollowThrough(
  input: HookInput,
  cfg: EnvConfig,
  role?: string,
): void {
  save(input, cfg, {
    schemaVersion: 2,
    pending: true,
    lastRole: role || undefined,
    yankCount: 0,
    childFinished: false,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * SubagentEnd: child exited — keep pending so parent still integrates.
 * Does not clear follow-through (v1.1.3).
 */
export function markSubagentChildFinished(
  input: HookInput,
  cfg: EnvConfig,
  role?: string,
): void {
  const st = load(input, cfg);
  // If Start was missed, still arm so parent is nudged to recover
  save(input, cfg, {
    schemaVersion: 2,
    pending: true,
    lastRole: role || st.lastRole,
    yankCount: st.pending ? st.yankCount || 0 : 0,
    childFinished: true,
    updatedAt: new Date().toISOString(),
  });
}

/** Clear pending after get_task_output / inline subagent result / real progress. */
export function clearSpawnFollowThrough(input: HookInput, cfg: EnvConfig): void {
  const st = load(input, cfg);
  if (!st.pending && !st.yankCount && !st.childFinished) return;
  save(input, cfg, {
    schemaVersion: 2,
    pending: false,
    lastRole: st.lastRole,
    yankCount: 0,
    childFinished: false,
    updatedAt: new Date().toISOString(),
  });
}

export function isSpawnFollowThroughPending(
  input: HookInput,
  cfg: EnvConfig,
): boolean {
  return load(input, cfg).pending;
}

/** Tools that fetch subagent/shell task output → result recovered. */
export function isResultRecoveryTool(toolName?: string): boolean {
  if (!toolName) return false;
  // strip separators so get_command_or_subagent_output → getcommandorsubagentoutput
  const n = toolName.toLowerCase().replace(/[^a-z]/g, "");
  return (
    n.includes("gettaskoutput") ||
    n.includes("getcommandorsubagentoutput") ||
    n.includes("getsubagentoutput") ||
    n.includes("awaitsubagent")
  );
}

/**
 * Sync spawn already returned a substantial payload (not just "started").
 * Heuristic: long output with evidence-ish content, or recovered-message shape.
 */
export function isInlineSubagentResult(toolOutput?: string): boolean {
  if (!toolOutput) return false;
  const t = toolOutput.trim();
  if (t.length < 80) return false;
  if (isSpawnAnnounceMessage(t.slice(0, 280))) return false;
  if (isSpawnResultRecoveredMessage(t)) return true;
  // substantial body with code/path/structure signals (sync spawn payload)
  const evidence =
    /[\\/].+\.\w{1,8}\b/.test(t) ||
    /\b(function|class|export|error|found|file|line|recommend)\b/i.test(t) ||
    /```/.test(t);
  return t.length >= 100 && evidence;
}

/**
 * "I spawned explore" / "dispatched hephaestus" without concrete results.
 * Long messages with evidence keywords are NOT spawn-announce.
 */
export function isSpawnAnnounceMessage(msg?: string): boolean {
  if (!msg) return false;
  const t = msg.trim();
  if (!t || t.length > 280) return false;
  if (
    /\b(found|fixed|edited|implemented|verified|passed|failing|diff|VERDICT|GOAL_DONE|integrated|get_task_output)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return (
    /\b(spawned|dispatched|launched|delegated)\b/i.test(t) ||
    /\bspawn_subagent\b/i.test(t) ||
    /派出|委派|已 spawn|子代理|等待.*结果|等结果/i.test(t) ||
    /^waiting for (the )?(agent|subagent|result)/i.test(t)
  );
}

/** Evidence that parent recovered/used subagent output (not just dispatched). */
export function isSpawnResultRecoveredMessage(msg?: string): boolean {
  if (!msg || !msg.trim()) return false;
  const t = msg.trim();
  return (
    /\b(get_task_output|subagent (result|output|replied|returned)|integrated (findings|results)|from (the )?subagent)\b/i.test(
      t,
    ) ||
    /子代理.*(结果|输出|回报)|回收.*结果|整合.*发现/i.test(t)
  );
}

function reasonForYank(
  role: string | undefined,
  yankCount: number,
  max: number,
  childFinished?: boolean,
): string {
  const roleBit = role ? ` (**${role}**)` : "";
  const wave = `yank ${yankCount}/${max}`;
  const finishedBit = childFinished
    ? " Host reports the subagent **finished** — recover and integrate its output now."
    : "";
  if (yankCount >= max) {
    return [
      "<OMG_SPAWN_FOLLOWTHROUGH>",
      `Subagent follow-through${roleBit} — final reminder (${wave}).${finishedBit}`,
      "",
      "You still have not shown result recovery after spawn. Do this now:",
      "1) **get_task_output** (or read the spawn tool reply) for the subagent id,",
      "2) Quote concrete findings (paths, symbols, decisions) in your next action,",
      "3) Edit code / update plan / spawn the *next* specialist with a new goal.",
      "Do not end the turn with only 'spawned' / 'waiting' / idle fluff.",
      "</OMG_SPAWN_FOLLOWTHROUGH>",
    ].join("\n");
  }
  return [
    "<OMG_SPAWN_FOLLOWTHROUGH>",
    `Subagent spawn armed follow-through${roleBit} (${wave}).${finishedBit}`,
    "Last reply was idle or spawn-announce only — recover the result before stopping.",
    "",
    "Continue the parent loop:",
    "1) Wait for / read the subagent result (`get_task_output` or the tool reply),",
    "2) Integrate findings into code or plan, or",
    "3) Spawn the next specialist with a concrete goal — do not stop after only dispatching.",
    "</OMG_SPAWN_FOLLOWTHROUGH>",
  ].join("\n");
}

/**
 * Stop gate: pending + (idle | spawn-announce) => block up to MAX_YANKS.
 * Progress or result-recovery language clears pending.
 */
export function spawnFollowThroughStopReason(
  input: HookInput,
  cfg: EnvConfig,
): string | null {
  const st = load(input, cfg);
  if (!st.pending) return null;

  const msg = input.lastAssistantMessage;
  const idle = isIdleAssistantMessage(msg);
  const announce = isSpawnAnnounceMessage(msg);
  const recovered = isSpawnResultRecoveredMessage(msg);

  if (recovered || (!idle && !announce)) {
    save(input, cfg, {
      ...st,
      pending: false,
      yankCount: 0,
      childFinished: false,
    });
    return null;
  }

  const nextYank = (st.yankCount || 0) + 1;
  const max = SPAWN_FOLLOWTHROUGH_MAX_YANKS;
  const keepPending = nextYank < max;
  save(input, cfg, {
    ...st,
    pending: keepPending,
    yankCount: nextYank,
    childFinished: keepPending ? st.childFinished : false,
  });
  return reasonForYank(st.lastRole, nextYank, max, st.childFinished);
}
