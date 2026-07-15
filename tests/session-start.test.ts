/**
 * session-start + rules injection (MAGI v0.25).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { handleSessionStart } from "../src/events/session-start.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import {
  loadInjectedRules,
  readPluginVersion,
  sisyphusBootstrap,
  truncateRulesText,
  usingSuperpowersHint,
} from "../src/features/rules.js";
import { readJson } from "../src/state/fs.js";
import { pathsFor } from "../src/state/paths.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-ss-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function cfg(pluginData: string, over: Partial<EnvConfig> = {}): EnvConfig {
  return {
    pluginRoot: repoRoot,
    pluginData,
    grokHome: pluginData,
    stateDirName: ".omg",
    skillGate: true,
    intentGate: true,
    planMode: true,
    hashline: false,
    diagEnforce: false,
    hardOrchestration: true,
    maxRalphIter: 10,
    todoCooldownMs: 5000,
    todoAbortWindowMs: 3000,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: false,
    commentCheckerDeny: false,
    agentGuard: false,
    categoryDiscipline: false,
    ...over,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "session-start",
    sessionId: "ss-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

describe("readPluginVersion / truncateRulesText", () => {
  it("reads package.json version from pluginRoot", () => {
    const v = readPluginVersion(repoRoot);
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
    expect(v).not.toBe("0.16.0");
  });

  it("missing package → 0.0.0", () => {
    const d = tmpWorkspace();
    expect(readPluginVersion(d)).toBe("0.0.0");
  });

  it("truncateRulesText keeps CJK well-formed", () => {
    const s = "测".repeat(100);
    const t = truncateRulesText(s, 10);
    expect(Array.from(t).length).toBe(10);
    expect(t).not.toMatch(/\uFFFD/);
  });
});

describe("loadInjectedRules", () => {
  it("injects workspace AGENTS.md + plugin rules", () => {
    const ws = tmpWorkspace();
    fs.writeFileSync(path.join(ws, "AGENTS.md"), "# Workspace agents\n", "utf8");
    const text = loadInjectedRules(ws, cfg(path.join(ws, "pdata")));
    expect(text).toMatch(/OMG_RULES/);
    expect(text).toMatch(/AGENTS\.md/);
    expect(text).toMatch(/Workspace agents/);
    // plugin rules/00-sisyphus.md exists in repo
    expect(text).toMatch(/rules\//);
  });

  it("prefers AGENTS.md over CLAUDE.md", () => {
    const ws = tmpWorkspace();
    fs.writeFileSync(path.join(ws, "AGENTS.md"), "FROM_AGENTS\n", "utf8");
    fs.writeFileSync(path.join(ws, "CLAUDE.md"), "FROM_CLAUDE\n", "utf8");
    const text = loadInjectedRules(ws, cfg(path.join(ws, "pdata")));
    expect(text).toContain("FROM_AGENTS");
    expect(text).not.toContain("FROM_CLAUDE");
  });
});

describe("sisyphusBootstrap / superpowers", () => {
  it("bootstrap lists specialists and loops", () => {
    const b = sisyphusBootstrap();
    expect(b).toMatch(/OMG_SISYPHUS/);
    expect(b).toMatch(/explore|oracle|hephaestus|prometheus/i);
    expect(b).toMatch(/ulw|ralph|start-work/i);
  });

  it("usingSuperpowersHint points at skill path", () => {
    const h = usingSuperpowersHint(repoRoot);
    expect(h).toMatch(/OMG_USING_SUPERPOWERS/);
    expect(h).toMatch(/using-superpowers|SKILL\.md/);
  });
});

describe("handleSessionStart", () => {
  it("writes fingerprint with live package version", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    const out = handleSessionStart(base(ws), c);
    expect("additionalContext" in out && out.additionalContext).toMatch(
      /OMG_SISYPHUS|SessionStart OK/,
    );
    const p = pathsFor(ws, "ss-sess", c);
    const fp = readJson<{ version: string; plugin: string }>(p.fingerprint, {
      version: "",
      plugin: "",
    });
    expect(fp.plugin).toBe("oh-my-grok");
    expect(fp.version).toBe(readPluginVersion(repoRoot));
    expect(fp.version).not.toBe("0.16.0");
  });

  it("resets prompt count and injects rules", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    fs.writeFileSync(path.join(ws, "AGENTS.md"), "RULEZ\n", "utf8");
    const p = pathsFor(ws, "ss-sess", c);
    fs.mkdirSync(path.dirname(p.promptCount), { recursive: true });
    fs.writeFileSync(p.promptCount, JSON.stringify({ n: 9 }), "utf8");
    const out = handleSessionStart(base(ws), c);
    expect(readJson<{ n: number }>(p.promptCount, { n: -1 }).n).toBe(0);
    expect("additionalContext" in out && out.additionalContext).toMatch(/RULEZ|OMG_RULES/);
  });

  it("includes superpowers hint and dual-enable warning", () => {
    const ws = tmpWorkspace();
    const out = handleSessionStart(base(ws), cfg(path.join(ws, "pdata")));
    const ctx = "additionalContext" in out ? String(out.additionalContext) : "";
    expect(ctx).toMatch(/SUPERPOWERS|using-superpowers/i);
    expect(ctx).toMatch(/dual-enable|mihazs|conflict/i);
  });
});

describe("UserPrompt first-turn alive banner version", () => {
  it("first prompt alive line uses package version not v0.2", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data);
    handleSessionStart(base(ws), c);
    const out = handleUserPrompt(
      base(ws, { event: "user-prompt", prompt: "hello" }),
      c,
    );
    const ctx = "additionalContext" in out ? String(out.additionalContext) : "";
    const ver = readPluginVersion(repoRoot);
    expect(ctx).toMatch(new RegExp(`harness v${ver.replace(/\./g, "\\.")}`));
    expect(ctx).not.toMatch(/harness v0\.2\b/);
  });
});
