/**
 * Spawn follow-through gate (v0.21) — complementary to category-discipline.
 * After a subagent spawn, if the parent stops on idle fluff or "I spawned X"
 * without real progress, block Stop once to force result recovery / next step.
 */
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { isIdleAssistantMessage } from "./idle-turn.js";

export interface SpawnFollowThroughState {
  schemaVersion: 1;
  /** Set true on each spawn; cleared after follow-through yank or real progress. */
  pending: boolean;
  lastRole?: string;
  updatedAt: string;
}

function fileFor(input: HookInput, cfg: EnvConfig): string {
  return path.join(
    pathsFor(input.workspaceRoot, input.sessionId, cfg).session,
    "spawn-followthrough.json",
  );
}

function load(input: HookInput, cfg: EnvConfig): SpawnFollowThroughState {
  return readJson<SpawnFollowThroughState>(fileFor(input, cfg), {
    schemaVersion: 1,
    pending: false,
    updatedAt: "",
  });
}

function save(input: HookInput, cfg: EnvConfig, st: SpawnFollowThroughState): void {
  writeJsonAtomic(fileFor(input, cfg), {
    ...st,
    updatedAt: new Date().toISOString(),
  });
}

/** PostTool spawn — arm follow-through for next Stop. */
export function markSpawnFollowThrough(
  input: HookInput,
  cfg: EnvConfig,
  role?: string,
): void {
  save(input, cfg, {
    schemaVersion: 1,
    pending: true,
    lastRole: role || undefined,
    updatedAt: new Date().toISOString(),
  });
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
    /\b(found|fixed|edited|implemented|verified|passed|failing|diff|VERDICT|GOAL_DONE)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return (
    /\b(spawned|dispatched|launched|delegated)\b/i.test(t) ||
    /\bspawn_subagent\b/i.test(t) ||
    /派出|委派|已 spawn|子代理/i.test(t) ||
    /^waiting for (the )?(agent|subagent|result)/i.test(t)
  );
}

/**
 * Stop gate: pending follow-through + (idle | spawn-announce) => block once.
 * Real progress clears pending without blocking.
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

  if (!idle && !announce) {
    // Parent made real progress after spawn — no yank
    save(input, cfg, { ...st, pending: false });
    return null;
  }

  save(input, cfg, { ...st, pending: false });
  const role = st.lastRole ? ` (**${st.lastRole}**)` : "";
  return [
    "<OMG_SPAWN_FOLLOWTHROUGH>",
    `Subagent spawn armed follow-through${role}, but the last reply was idle / spawn-announce only.`,
    "",
    "Continue the parent loop:",
    "1) Wait for / read the subagent result (use get_task_output or the tool reply),",
    "2) Integrate findings into code or plan, or",
    "3) Spawn the next specialist with a concrete goal — do not stop after only dispatching.",
    "</OMG_SPAWN_FOLLOWTHROUGH>",
  ].join("\n");
}
