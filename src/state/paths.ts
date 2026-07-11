import path from "node:path";
import type { EnvConfig } from "../protocol/types.js";

export function workspaceStateRoot(workspaceRoot: string, cfg: EnvConfig): string {
  if (path.isAbsolute(cfg.stateDirName)) return cfg.stateDirName;
  return path.join(workspaceRoot, cfg.stateDirName);
}

export function sessionStateRoot(cfg: EnvConfig): string {
  return cfg.pluginData;
}

export function pathsFor(workspaceRoot: string, sessionId: string, cfg: EnvConfig) {
  const omg = workspaceStateRoot(workspaceRoot, cfg);
  const sess = path.join(sessionStateRoot(cfg), sessionId);
  return {
    omg,
    session: sess,
    fingerprint: path.join(sessionStateRoot(cfg), "fingerprint.json"),
    skillGate: path.join(sess, "skill-gate.json"),
    todoEnforcer: path.join(sess, "todo-enforcer.json"),
    stopContinuation: path.join(sess, "stop-continuation.json"),
    promptCount: path.join(sess, "prompt-count.json"),
    ralph: path.join(omg, "ralph-loop.local.md"),
    ulwDir: path.join(omg, "ulw-loop"),
    ulwLogDir: path.join(omg, "ulw-loop", "log"),
    boulder: path.join(omg, "boulder.json"),
    todosDir: path.join(omg, "todos"),
    todosFile: path.join(omg, "todos", `${sessionId}.json`),
    plansDir: path.join(omg, "plans"),
    handoffsDir: path.join(omg, "handoffs"),
    planMode: path.join(omg, "plan-mode.json"),
    config: path.join(omg, "config.json"),
  };
}
