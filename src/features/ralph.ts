import type { EnvConfig, HookInput } from "../protocol/types.js";
import { readText, removeFile, writeTextAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";

const DONE_MARKERS = [
  "<promise>DONE</promise>",
  "<promise>done</promise>",
  "RALPH_DONE",
  "ULW_DONE",
];

export interface RalphState {
  active: boolean;
  mode: "ralph" | "ulw";
  task: string;
  iteration: number;
  maxIterations: number;
  createdAt: string;
}

function parseRalphFile(text: string | null): RalphState | null {
  if (!text) return null;
  const mode = /mode:\s*ulw/i.test(text) ? "ulw" : "ralph";
  const taskM = text.match(/^task:\s*(.+)$/m);
  const iterM = text.match(/^iteration:\s*(\d+)/m);
  const maxM = text.match(/^max_iterations:\s*(\d+)/m);
  const task = taskM?.[1]?.trim() || text.split("\n").find((l) => !l.startsWith("#") && l.includes(":")) || "continue work";
  return {
    active: true,
    mode,
    task: task.replace(/^task:\s*/i, ""),
    iteration: Number(iterM?.[1] || "0") || 0,
    maxIterations: Number(maxM?.[1] || "50") || 50,
    createdAt: new Date().toISOString(),
  };
}

export function serializeRalph(state: RalphState): string {
  return [
    "# oh-my-grok ralph / ulw loop",
    `mode: ${state.mode}`,
    `task: ${state.task}`,
    `iteration: ${state.iteration}`,
    `max_iterations: ${state.maxIterations}`,
    `created_at: ${state.createdAt}`,
    "",
    "Completion: output <promise>DONE</promise> when the task is fully done.",
    "",
  ].join("\n");
}

export function loadRalph(input: HookInput, cfg: EnvConfig): RalphState | null {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  return parseRalphFile(readText(p.ralph));
}

export function startRalph(
  input: HookInput,
  cfg: EnvConfig,
  task: string,
  mode: "ralph" | "ulw",
): RalphState {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  const state: RalphState = {
    active: true,
    mode,
    task,
    iteration: 0,
    maxIterations: cfg.maxRalphIter,
    createdAt: new Date().toISOString(),
  };
  writeTextAtomic(p.ralph, serializeRalph(state));
  return state;
}

export function cancelRalph(input: HookInput, cfg: EnvConfig): void {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  removeFile(p.ralph);
}

export function bumpRalph(input: HookInput, cfg: EnvConfig, state: RalphState): RalphState {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  state.iteration += 1;
  writeTextAtomic(p.ralph, serializeRalph(state));
  return state;
}

export function isDoneMessage(msg?: string): boolean {
  if (!msg) return false;
  return DONE_MARKERS.some((m) => msg.includes(m));
}

export function detectRalphCommand(prompt: string): {
  action: "start-ralph" | "start-ulw" | "cancel" | null;
  task: string;
} {
  const p = prompt.trim();
  if (/^\/cancel-ralph\b/i.test(p) || /^cancel-ralph\b/i.test(p)) {
    return { action: "cancel", task: "" };
  }
  const ralph = p.match(/^\/ralph-loop(?:\s+["']?(.+?)["']?)?\s*$/i) || p.match(/^\/ralph-loop\s+(.+)/is);
  if (ralph) return { action: "start-ralph", task: (ralph[1] || "complete the current task").trim() };
  const ulw =
    p.match(/^\/ulw-loop(?:\s+["']?(.+?)["']?)?\s*$/i) ||
    p.match(/^\/ultrawork(?:\s+["']?(.+?)["']?)?\s*$/i) ||
    p.match(/^\/ulw(?:\s+["']?(.+?)["']?)?\s*$/i);
  if (ulw) return { action: "start-ulw", task: (ulw[1] || "ultrawork until fully done").trim() };
  // bare keyword ultrawork / ulw as intent (not slash)
  if (/^\s*ultrawork\b/i.test(p) || /^\s*ulw\b/i.test(p)) {
    return { action: "start-ulw", task: p.replace(/^\s*(ultrawork|ulw)\s*/i, "").trim() || "ultrawork until fully done" };
  }
  return { action: null, task: "" };
}

export function ralphStopReason(state: RalphState): string {
  const header =
    state.mode === "ulw"
      ? "ULTRAWORK / ULW LOOP — continue until 100% done."
      : "RALPH LOOP — work until done.";
  return [
    header,
    `Task: ${state.task}`,
    `Iteration: ${state.iteration + 1}/${state.maxIterations}`,
    "",
    "You MUST continue working on the task. Do not stop with idle chatter.",
    "When (and only when) the task is fully complete, output: <promise>DONE</promise>",
    state.mode === "ulw"
      ? "ULW: explore → implement → verify (tests/build) → only then DONE."
      : "Ralph: make concrete progress each iteration.",
    "Operate as Sisyphus: delegate via spawn_subagent when useful (explore/oracle/hephaestus).",
  ].join("\n");
}
