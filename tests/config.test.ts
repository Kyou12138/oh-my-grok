/**
 * Config loading suite — pure-function coverage for src/features/config.ts.
 *
 * testability: loadConfig(workspaceRoot?) is exported directly; we drive it
 * with a process.env overlay + os.tmpdir() workspace to assert env-switch,
 * envNum boundary, file-overlay precedence, stateDirName resolution and
 * pluginData fallback semantics.
 *
 * env hygiene: every `it` snapshots the exact OMG_* / GROK_* keys it touches
 * and afterEach restores them, so no env mutation leaks across tests. The
 * workspaceRoot is always an mkdtempSync scratch dir, cleaned in afterEach.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/features/config.js";

/** All OMG_* / GROK_* keys loadConfig may read. */
const WATCHED_KEYS = [
  "OMG_SKILL_GATE",
  "OMG_HASHLINE",
  "OMG_AGENT_GUARD",
  "OMG_CATEGORY_DISCIPLINE",
  "OMG_INTENT_GATE",
  "OMG_PLAN_MODE",
  "OMG_DIAG_ENFORCE",
  "OMG_HARD_ORCH",
  "OMG_COMMENT_CHECKER",
  "OMG_COMMENT_CHECKER_DENY",
  "OMG_MAX_RALPH_ITER",
  "OMG_TODO_COOLDOWN_MS",
  "OMG_TODO_ABORT_WINDOW_MS",
  "OMG_DIAG_CMD",
  "OMG_DIAG_TIMEOUT_MS",
  "OMG_HASHLINE_TTL_MS",
  "OMG_STATE_DIR",
  "GROK_HOME",
  "GROK_PLUGIN_DATA",
  "GROK_PLUGIN_ROOT",
  "GROK_WORKSPACE_ROOT",
  "USERPROFILE",
  "HOME",
] as const;

type Snapshot = Record<string, string | undefined>;

const tmpRoots: string[] = [];
const envSnapshots: Snapshot[] = [];

function snapshotEnv(): Snapshot {
  const snap: Snapshot = {};
  for (const k of WATCHED_KEYS) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: Snapshot): void {
  for (const k of WATCHED_KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

function tmpWorkspace(prefix = "omg-config-"): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  for (const snap of envSnapshots.splice(0)) {
    restoreEnv(snap);
  }
});

/** Track an env snapshot for the duration of the current test. */
function pinEnv(): void {
  envSnapshots.push(snapshotEnv());
}

describe("loadConfig — env switches", () => {
  it("OMG_SKILL_GATE='0' disables skillGate; restored it returns to true", () => {
    pinEnv();
    delete process.env.GROK_PLUGIN_ROOT;
    delete process.env.GROK_PLUGIN_DATA;
    delete process.env.GROK_HOME;

    process.env.OMG_SKILL_GATE = "0";
    expect(loadConfig().skillGate).toBe(false);

    delete process.env.OMG_SKILL_GATE;
    expect(loadConfig().skillGate).toBe(true);
  });

  it("OMG_HASHLINE='0' disables hashline", () => {
    pinEnv();
    process.env.OMG_HASHLINE = "0";
    expect(loadConfig().hashline).toBe(false);
    delete process.env.OMG_HASHLINE;
    expect(loadConfig().hashline).toBe(true);
  });

  it("OMG_AGENT_GUARD='0' disables agentGuard", () => {
    pinEnv();
    process.env.OMG_AGENT_GUARD = "0";
    expect(loadConfig().agentGuard).toBe(false);
    delete process.env.OMG_AGENT_GUARD;
    expect(loadConfig().agentGuard).toBe(true);
  });

  it("OMG_CATEGORY_DISCIPLINE='0' disables categoryDiscipline (spiral-2 switch)", () => {
    pinEnv();
    process.env.OMG_CATEGORY_DISCIPLINE = "0";
    expect(loadConfig().categoryDiscipline).toBe(false);
    delete process.env.OMG_CATEGORY_DISCIPLINE;
    expect(loadConfig().categoryDiscipline).toBe(true);
  });

  it("treats lowercase 'false' as off and any other truthy string as on", () => {
    pinEnv();
    process.env.OMG_SKILL_GATE = "false";
    expect(loadConfig().skillGate).toBe(false);
    process.env.OMG_SKILL_GATE = "yes";
    expect(loadConfig().skillGate).toBe(true);
    process.env.OMG_SKILL_GATE = "FALSE";
    expect(loadConfig().skillGate).toBe(false);
  });
});

describe("loadConfig — envNum boundaries", () => {
  it("OMG_MAX_RALPH_ITER='-5' falls back to default 50", () => {
    pinEnv();
    process.env.OMG_MAX_RALPH_ITER = "-5";
    expect(loadConfig().maxRalphIter).toBe(50);
  });

  it("OMG_MAX_RALPH_ITER='abc' falls back to default 50", () => {
    pinEnv();
    process.env.OMG_MAX_RALPH_ITER = "abc";
    expect(loadConfig().maxRalphIter).toBe(50);
  });

  it("OMG_MAX_RALPH_ITER unset also falls back to 50", () => {
    pinEnv();
    delete process.env.OMG_MAX_RALPH_ITER;
    expect(loadConfig().maxRalphIter).toBe(50);
  });

  it("OMG_TODO_COOLDOWN_MS='9999' is honored as 9999", () => {
    pinEnv();
    process.env.OMG_TODO_COOLDOWN_MS = "9999";
    expect(loadConfig().todoCooldownMs).toBe(9999);
  });
});

describe("loadConfig — file overlay precedence", () => {
  it(".omg/config.json {skillGate:false} overrides the env default true", () => {
    pinEnv();
    delete process.env.OMG_SKILL_GATE; // env default true
    const ws = tmpWorkspace();
    const cfgDir = path.join(ws, ".omg");
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfgDir, "config.json"),
      JSON.stringify({ skillGate: false }),
    );
    expect(loadConfig(ws).skillGate).toBe(false);
  });

  it("file overlay wins over env value (env explicitly on, file off)", () => {
    pinEnv();
    process.env.OMG_HASHLINE = "1";
    const ws = tmpWorkspace();
    const cfgDir = path.join(ws, ".omg");
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfgDir, "config.json"),
      JSON.stringify({ hashline: false }),
    );
    expect(loadConfig(ws).hashline).toBe(false);
  });

  it("missing workspaceRoot reads no overlay file (env defaults stand)", () => {
    pinEnv();
    delete process.env.OMG_PLAN_MODE;
    // No workspaceRoot → no file read path at all.
    expect(loadConfig().planMode).toBe(true);
  });

  it("nonexistent config.json is silently skipped (falls back to env)", () => {
    pinEnv();
    delete process.env.OMG_INTENT_GATE;
    const ws = tmpWorkspace(); // no .omg/ created
    expect(loadConfig(ws).intentGate).toBe(true);
  });
});

describe("loadConfig — stateDirName", () => {
  it("OMG_STATE_DIR='.custom' is reflected in stateDirName", () => {
    pinEnv();
    process.env.OMG_STATE_DIR = ".custom";
    expect(loadConfig().stateDirName).toBe(".custom");
  });

  it("defaults to '.omg' when OMG_STATE_DIR is unset", () => {
    pinEnv();
    delete process.env.OMG_STATE_DIR;
    expect(loadConfig().stateDirName).toBe(".omg");
  });

  it("absolute OMG_STATE_DIR skips joining workspaceRoot for the config path", () => {
    pinEnv();
    const ws = tmpWorkspace();
    const absState = tmpWorkspace("omg-absstate-");
    process.env.OMG_STATE_DIR = absState;

    // Drop a config under the absolute state dir with a tell-tale toggle.
    fs.writeFileSync(
      path.join(absState, "config.json"),
      JSON.stringify({ skillGate: false }),
    );

    // Even though workspaceRoot is passed, the loader must consult the
    // absolute state dir — proving it did NOT join workspaceRoot.
    expect(loadConfig(ws).skillGate).toBe(false);

    // And the returned name still reflects the absolute path as-is.
    expect(loadConfig(ws).stateDirName).toBe(absState);
  });
});

describe("loadConfig — pluginData fallback", () => {
  it("falls back to pluginRoot/.omg-plugin-data when no GROK_PLUGIN_DATA / GROK_HOME", () => {
    pinEnv();
    delete process.env.GROK_PLUGIN_DATA;
    delete process.env.GROK_HOME;
    delete process.env.USERPROFILE;
    delete process.env.HOME;
    // GROK_PLUGIN_ROOT drives pluginRoot; pin it for a deterministic assertion.
    const fakeRoot = tmpWorkspace("omg-root-");
    process.env.GROK_PLUGIN_ROOT = fakeRoot;

    const c = loadConfig();
    expect(c.pluginData).toBe(`${fakeRoot}/.omg-plugin-data`);
  });

  it("prefers GROK_PLUGIN_DATA over the fallback", () => {
    pinEnv();
    process.env.GROK_PLUGIN_DATA = "/custom/grok/data";
    delete process.env.GROK_HOME;
    expect(loadConfig().pluginData).toBe("/custom/grok/data");
  });
});

describe("loadConfig — categoryDiscipline (spiral-2 sanity)", () => {
  it("OMG_CATEGORY_DISCIPLINE='0' → categoryDiscipline === false", () => {
    pinEnv();
    process.env.OMG_CATEGORY_DISCIPLINE = "0";
    expect(loadConfig().categoryDiscipline).toBe(false);
  });
});
