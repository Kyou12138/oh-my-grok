import fs from "node:fs";
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { ensureDir, readJson, readText, removeFile, writeJsonAtomic, writeTextAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { incompleteTodos } from "./todo-boulder.js";
import { isVerifiedMessage, loadDiag } from "./diagnostics.js";

const DONE_MARKERS = [
  "<promise>DONE</promise>",
  "<promise>done</promise>",
  "RALPH_DONE",
  "ULW_DONE",
];

export type LoopPhase = "explore" | "implement" | "verify";

export interface RalphState {
  schemaVersion: 2;
  active: boolean;
  mode: "ralph" | "ulw";
  task: string;
  iteration: number;
  maxIterations: number;
  createdAt: string;
  /** ULW phase machine */
  phase: LoopPhase;
  /** explore/implement/verify seen this loop */
  phaseReached: {
    explore: boolean;
    implement: boolean;
    verify: boolean;
  };
  /** consecutive iterations without progress */
  stallCount: number;
  lastActivityAt: string;
  /** last stop fingerprint of activity counters */
  lastActivityFingerprint: string;
}

export interface UlwActivity {
  schemaVersion: 1;
  reads: number;
  writes: number;
  shells: number;
  lastPaths: string[];
  updatedAt: string;
}

const DEFAULT_PHASE: LoopPhase = "explore";

function emptyState(partial: Partial<RalphState> & Pick<RalphState, "mode" | "task" | "maxIterations">): RalphState {
  return {
    schemaVersion: 2,
    active: true,
    mode: partial.mode,
    task: partial.task,
    iteration: partial.iteration ?? 0,
    maxIterations: partial.maxIterations,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    phase: partial.phase ?? DEFAULT_PHASE,
    phaseReached: partial.phaseReached ?? { explore: false, implement: false, verify: false },
    stallCount: partial.stallCount ?? 0,
    lastActivityAt: partial.lastActivityAt ?? new Date().toISOString(),
    lastActivityFingerprint: partial.lastActivityFingerprint ?? "",
  };
}

function stateJsonPath(input: HookInput, cfg: EnvConfig): string {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  return path.join(p.ulwDir, "state.json");
}

function activityPath(input: HookInput, cfg: EnvConfig): string {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  return path.join(p.session, "ulw-activity.json");
}

function parseLegacyMd(text: string): RalphState | null {
  if (!text) return null;
  const mode = /mode:\s*ulw/i.test(text) ? "ulw" : "ralph";
  const taskM = text.match(/^task:\s*(.+)$/m);
  const iterM = text.match(/^iteration:\s*(\d+)/m);
  const maxM = text.match(/^max_iterations:\s*(\d+)/m);
  const phaseM = text.match(/^phase:\s*(explore|implement|verify)/im);
  const task =
    taskM?.[1]?.trim() ||
    "continue work";
  return emptyState({
    mode,
    task: task.replace(/^task:\s*/i, ""),
    iteration: Number(iterM?.[1] || "0") || 0,
    maxIterations: Number(maxM?.[1] || "50") || 50,
    phase: (phaseM?.[1] as LoopPhase) || DEFAULT_PHASE,
  });
}

export function serializeRalphMd(state: RalphState): string {
  return [
    "# oh-my-grok ralph / ulw loop (v2)",
    `mode: ${state.mode}`,
    `task: ${state.task}`,
    `iteration: ${state.iteration}`,
    `max_iterations: ${state.maxIterations}`,
    `phase: ${state.phase}`,
    `stall_count: ${state.stallCount}`,
    `created_at: ${state.createdAt}`,
    "",
    state.mode === "ulw"
      ? "ULW: explore → implement → verify. DONE only after verify evidence."
      : "Ralph: make concrete progress each iteration.",
    "Completion: <promise>DONE</promise>",
    "Verify: <promise>VERIFIED</promise> or diagnostics clean / tests passed",
    "",
  ].join("\n");
}

export function loadRalph(input: HookInput, cfg: EnvConfig): RalphState | null {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const jsonPath = stateJsonPath(input, cfg);
  if (fs.existsSync(jsonPath)) {
    const j = readJson<RalphState | null>(jsonPath, null);
    if (j?.active) {
      return emptyState({
        ...j,
        mode: j.mode === "ulw" ? "ulw" : "ralph",
        task: j.task || "continue work",
        maxIterations: j.maxIterations || cfg.maxRalphIter,
      });
    }
  }
  const md = readText(p.ralph);
  if (!md) return null;
  return parseLegacyMd(md);
}

function persist(input: HookInput, cfg: EnvConfig, state: RalphState): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.ulwDir);
  ensureDir(p.ulwLogDir);
  writeTextAtomic(p.ralph, serializeRalphMd(state));
  writeJsonAtomic(stateJsonPath(input, cfg), state);
}

export function startRalph(
  input: HookInput,
  cfg: EnvConfig,
  task: string,
  mode: "ralph" | "ulw",
): RalphState {
  const state = emptyState({
    mode,
    task,
    maxIterations: mode === "ulw" ? Math.max(cfg.maxRalphIter, 50) : cfg.maxRalphIter,
    phase: "explore",
  });
  persist(input, cfg, state);
  resetUlwActivity(input, cfg);
  if (mode === "ulw") {
    writeProgressLog(input, cfg, state, "start", "ULW loop started");
  }
  return state;
}

export function cancelRalph(input: HookInput, cfg: EnvConfig): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  removeFile(p.ralph);
  removeFile(stateJsonPath(input, cfg));
}

export function bumpRalph(input: HookInput, cfg: EnvConfig, state: RalphState): RalphState {
  state.iteration += 1;
  state.lastActivityAt = new Date().toISOString();
  persist(input, cfg, state);
  return state;
}

export function saveRalph(input: HookInput, cfg: EnvConfig, state: RalphState): void {
  persist(input, cfg, state);
}

export function isDoneMessage(msg?: string): boolean {
  if (!msg) return false;
  return DONE_MARKERS.some((m) => msg.includes(m));
}

/** Detect ralph/ulw start — mid-sentence ulw/ultrawork supported. */
export function detectRalphCommand(prompt: string): {
  action: "start-ralph" | "start-ulw" | "cancel" | null;
  task: string;
} {
  const p = prompt.trim();
  if (/^\/cancel-ralph\b/i.test(p) || /^cancel-ralph\b/i.test(p)) {
    return { action: "cancel", task: "" };
  }

  const ralph =
    p.match(/^\/ralph-loop(?:\s+["']?(.+?)["']?)?\s*$/i) || p.match(/^\/ralph-loop\s+(.+)/is);
  if (ralph) {
    return { action: "start-ralph", task: (ralph[1] || "complete the current task").trim() };
  }

  // Explicit slash forms
  const ulwSlash =
    p.match(/^\/ulw-loop(?:\s+["']?(.+?)["']?)?\s*$/i) ||
    p.match(/^\/ultrawork(?:\s+["']?(.+?)["']?)?\s*$/i) ||
    p.match(/^\/ulw(?:\s+["']?(.+?)["']?)?\s*$/i);
  if (ulwSlash) {
    return {
      action: "start-ulw",
      task: (ulwSlash[1] || "ultrawork until fully done").trim(),
    };
  }

  // Mid-sentence / leading keywords (omo-style): "ulw 重构登录", "please ultrawork this"
  if (/\bultrawork\b/i.test(p) || /\bulw-loop\b/i.test(p) || /(^|[\s,;:，])ulw([\s,;:，]|$)/i.test(p) || /^\s*ulw\b/i.test(p)) {
    let task = p
      .replace(/\bultrawork\b/gi, " ")
      .replace(/\bulw-loop\b/gi, " ")
      .replace(/(^|[\s,;:，])ulw\b/gi, " ")
      .replace(/^\/+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!task) task = "ultrawork until fully done";
    return { action: "start-ulw", task };
  }

  return { action: null, task: "" };
}

// ─── Activity tracking ───────────────────────────────────────────────

export function loadUlwActivity(input: HookInput, cfg: EnvConfig): UlwActivity {
  return readJson<UlwActivity>(activityPath(input, cfg), {
    schemaVersion: 1,
    reads: 0,
    writes: 0,
    shells: 0,
    lastPaths: [],
    updatedAt: "",
  });
}

export function resetUlwActivity(input: HookInput, cfg: EnvConfig): void {
  writeJsonAtomic(activityPath(input, cfg), {
    schemaVersion: 1,
    reads: 0,
    writes: 0,
    shells: 0,
    lastPaths: [],
    updatedAt: new Date().toISOString(),
  } satisfies UlwActivity);
}

export function noteUlwRead(input: HookInput, cfg: EnvConfig, filePath?: string): void {
  const a = loadUlwActivity(input, cfg);
  a.reads += 1;
  if (filePath) a.lastPaths = [...new Set([filePath, ...a.lastPaths])].slice(0, 12);
  a.updatedAt = new Date().toISOString();
  writeJsonAtomic(activityPath(input, cfg), a);
}

export function noteUlwWrite(input: HookInput, cfg: EnvConfig, filePath?: string): void {
  const a = loadUlwActivity(input, cfg);
  a.writes += 1;
  if (filePath) a.lastPaths = [...new Set([filePath, ...a.lastPaths])].slice(0, 12);
  a.updatedAt = new Date().toISOString();
  writeJsonAtomic(activityPath(input, cfg), a);
}

export function activityFingerprint(a: UlwActivity): string {
  return `r${a.reads}:w${a.writes}:s${a.shells}`;
}

/** Advance phase from observed activity since last stop. */
export function advancePhaseFromActivity(
  state: RalphState,
  activity: UlwActivity,
): RalphState {
  if (activity.reads > 0) {
    state.phaseReached.explore = true;
    if (state.phase === "explore") state.phase = "implement";
  }
  if (activity.writes > 0) {
    state.phaseReached.implement = true;
    if (state.phase === "explore" || state.phase === "implement") {
      state.phase = "verify";
    }
  }
  return state;
}

export function markVerifyReached(state: RalphState): RalphState {
  state.phaseReached.verify = true;
  state.phase = "verify";
  return state;
}

// ─── DONE gate (ULW hard) ────────────────────────────────────────────

export function ulwDoneGate(
  input: HookInput,
  cfg: EnvConfig,
  state: RalphState,
  msg?: string,
): { ok: boolean; reason: string } {
  if (state.mode !== "ulw") {
    return { ok: true, reason: "" };
  }

  const problems: string[] = [];
  const diag = loadDiag(input, cfg);
  const verified =
    isVerifiedMessage(msg) ||
    Boolean(diag.verifiedAt && diag.verifiedAt > 0 && !diag.needsVerify && !diag.lastErrors);

  if (!state.phaseReached.explore && !state.phaseReached.implement) {
    problems.push("- No explore/implement evidence yet (Read/Write activity). Stay in explore/implement.");
  }
  if (!state.phaseReached.implement && state.phase !== "verify") {
    // allow if writes happened this turn via activity
    const act = loadUlwActivity(input, cfg);
    if (act.writes === 0) {
      problems.push("- No implementation writes observed. Implement before DONE.");
    }
  }
  if (!verified && !state.phaseReached.verify) {
    problems.push(
      "- ULW requires verify evidence: output <promise>VERIFIED</promise>, or say diagnostics clean / tests passed, after running checks.",
    );
  }
  if (diag.lastErrors) {
    problems.push("- Diagnostics still failing — fix before DONE.");
  }
  const todos = incompleteTodos(input, cfg);
  if (todos.length > 0) {
    problems.push(`- ${todos.length} incomplete todo(s) remain — finish or cancel them.`);
  }
  if (!state.phaseReached.explore) {
    problems.push("- Explore phase incomplete — Read/search codebase (spawn explore if useful).");
  }

  if (problems.length) {
    return {
      ok: false,
      reason: [
        "ULW DONE REJECTED — evidence gate failed.",
        `Task: ${state.task}`,
        `Phase: ${state.phase} | reached: explore=${state.phaseReached.explore} implement=${state.phaseReached.implement} verify=${state.phaseReached.verify}`,
        "",
        ...problems,
        "",
        "Continue ULW. When fully done with evidence, output <promise>VERIFIED</promise> then <promise>DONE</promise>.",
      ].join("\n"),
    };
  }
  return { ok: true, reason: "" };
}

// ─── Progress log + stop reason ──────────────────────────────────────

export function writeProgressLog(
  input: HookInput,
  cfg: EnvConfig,
  state: RalphState,
  kind: string,
  note: string,
): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.ulwLogDir);
  const act = loadUlwActivity(input, cfg);
  const file = path.join(
    p.ulwLogDir,
    `iter-${String(state.iteration).padStart(3, "0")}-${kind}.md`,
  );
  const body = [
    `# ULW iter ${state.iteration} (${kind})`,
    "",
    `- time: ${new Date().toISOString()}`,
    `- task: ${state.task}`,
    `- phase: ${state.phase}`,
    `- stall: ${state.stallCount}`,
    `- activity: reads=${act.reads} writes=${act.writes}`,
    `- paths: ${act.lastPaths.slice(0, 8).join(", ") || "(none)"}`,
    "",
    note,
    "",
  ].join("\n");
  writeTextAtomic(file, body);
}

export function ralphStopReason(state: RalphState, opts?: { stall?: boolean }): string {
  if (state.mode === "ralph") {
    return [
      "RALPH LOOP — work until done.",
      `Task: ${state.task}`,
      `Iteration: ${state.iteration + 1}/${state.maxIterations}`,
      "",
      "You MUST continue. Make concrete progress.",
      "When fully complete, output: <promise>DONE</promise>",
    ].join("\n");
  }

  const phaseHelp: Record<LoopPhase, string> = {
    explore:
      "PHASE explore: Search codebase (spawn explore). Read key files. List findings. Do NOT claim DONE.",
    implement:
      "PHASE implement: Apply code changes (hephaestus ok). Keep diffs focused. Update todos.",
    verify:
      "PHASE verify: Run tests/typecheck/lint. Fix failures. Then <promise>VERIFIED</promise> and only then <promise>DONE</promise>.",
  };

  return [
    "══════════════════════════════════════",
    "ULTRAWORK / ULW LOOP v2 — maximum intensity",
    "══════════════════════════════════════",
    `Task: ${state.task}`,
    `Iteration: ${state.iteration + 1}/${state.maxIterations}`,
    `Phase: ${state.phase}`,
    `Progress: explore=${state.phaseReached.explore} implement=${state.phaseReached.implement} verify=${state.phaseReached.verify}`,
    `Stall count: ${state.stallCount}`,
    "",
    phaseHelp[state.phase],
    "",
    "MANDATORY each iteration:",
    "1) Concrete action (search / edit / test) — no pure status chatter",
    "2) Prefer spawn_subagent: explore → hephaestus → verify",
    "3) Log what changed in your reply (files + commands)",
    "",
    "DONE gate (hard):",
    "- Must complete explore + implement evidence",
    "- Must VERIFIED (or diagnostics clean / tests passed)",
    "- Incomplete todos block DONE",
    "- Then output: <promise>DONE</promise>",
    opts?.stall
      ? "\n⚠ STALL DETECTED: no Read/Write progress last round. Change strategy — spawn oracle/explore, narrow scope, or try a different approach."
      : "",
    "══════════════════════════════════════",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Process one Stop event for an active loop. Returns block reason or null if loop ended cleanly. */
export function processLoopStop(
  input: HookInput,
  cfg: EnvConfig,
  state: RalphState,
): { block: boolean; reason: string; state: RalphState } {
  const msg = input.lastAssistantMessage;
  const activity = loadUlwActivity(input, cfg);

  // Apply activity → phase
  if (state.mode === "ulw") {
    advancePhaseFromActivity(state, activity);
    if (isVerifiedMessage(msg) || (loadDiag(input, cfg).verifiedAt && !loadDiag(input, cfg).lastErrors)) {
      markVerifyReached(state);
    }
  }

  // DONE claim
  if (isDoneMessage(msg)) {
    if (state.mode === "ulw") {
      const gate = ulwDoneGate(input, cfg, state, msg);
      if (!gate.ok) {
        state.iteration += 1;
        writeProgressLog(input, cfg, state, "done-rejected", gate.reason);
        resetUlwActivity(input, cfg);
        persist(input, cfg, state);
        return { block: true, reason: gate.reason, state };
      }
    }
    writeProgressLog(input, cfg, state, "done", "Loop completed");
    cancelRalph(input, cfg);
    return { block: false, reason: "", state };
  }

  // Max iterations
  if (state.iteration >= state.maxIterations) {
    cancelRalph(input, cfg);
    return {
      block: true,
      reason: [
        "RALPH/ULW max iterations reached — loop auto-cancelled.",
        `Task was: ${state.task}`,
        "Summarize progress. Re-run /ulw-loop or /ralph-loop if needed.",
      ].join("\n"),
      state,
    };
  }

  // Stall detection (ULW)
  const fp = activityFingerprint(activity);
  let stall = false;
  if (state.mode === "ulw") {
    if (state.lastActivityFingerprint && fp === state.lastActivityFingerprint && activity.reads === 0 && activity.writes === 0) {
      // compared to previous end-of-iter snapshot stored as last fingerprint with zero delta
      state.stallCount += 1;
      stall = state.stallCount >= 1;
    } else if (activity.reads === 0 && activity.writes === 0 && state.iteration > 0) {
      state.stallCount += 1;
      stall = true;
    } else {
      state.stallCount = 0;
    }
    state.lastActivityFingerprint = fp;
  }

  // Continue
  state.iteration += 1;
  writeProgressLog(
    input,
    cfg,
    state,
    "continue",
    stall ? "stall continuation" : `continue phase=${state.phase}`,
  );
  resetUlwActivity(input, cfg);
  persist(input, cfg, state);

  return {
    block: true,
    reason: ralphStopReason(state, { stall }),
    state,
  };
}
