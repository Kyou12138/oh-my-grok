/**
 * Star-readiness structural tests — prove public face + OSS hygiene match claims.
 * Drives real filesystem artifacts that ship in the repo (not re-implemented stubs).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectRalphCommand, startRalph, isDoneMessage } from "../src/features/ralph.js";
import { handleStop } from "../src/events/stop.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

describe("README top-of-funnel (star-ready)", () => {
  const readme = read("README.md");
  const top = readme.slice(0, 3500);

  it("states the problem (vanilla Grok long-task discipline)", () => {
    expect(top).toMatch(/problem|Vanilla Grok|long task|半途|discipline|harness/i);
    expect(top).toMatch(/stop|todo|skill|stale|drift/i);
  });

  it("states one-liner value: harness + Superpowers on Grok Build", () => {
    expect(top).toMatch(/harness/i);
    expect(top).toMatch(/Superpowers/i);
    expect(top).toMatch(/Grok Build/i);
  });

  it("has a single copy-paste GitHub install path", () => {
    expect(top).toMatch(/grok plugin install github\.com\/Kyou12138\/oh-my-grok --trust/);
    expect(top).toMatch(/grok plugin enable oh-my-grok/);
  });

  it("documents wow command ultrawork without requiring other files", () => {
    expect(top).toMatch(/ultrawork/i);
  });

  it("honest non-claims: Team Mode / multi-model limits", () => {
    expect(readme).toMatch(/Team Mode/i);
    expect(readme).toMatch(/platform limit|No|❌|not claim/i);
    expect(readme).toMatch(/multi-model|model routing|Multi-model/i);
  });

  it("links CI badge and CONTRIBUTING/CHANGELOG", () => {
    expect(readme).toMatch(/actions\/workflows\/ci\.yml/);
    expect(readme).toMatch(/CONTRIBUTING\.md/);
    expect(readme).toMatch(/CHANGELOG\.md/);
  });
});

describe("OSS hygiene artifacts", () => {
  it("has MIT LICENSE", () => {
    expect(exists("LICENSE")).toBe(true);
    expect(read("LICENSE")).toMatch(/MIT License/i);
  });

  it("has CONTRIBUTING and CHANGELOG for public version", () => {
    expect(exists("CONTRIBUTING.md")).toBe(true);
    expect(exists("CHANGELOG.md")).toBe(true);
    const cl = read("CHANGELOG.md");
    expect(cl).toMatch(/0\.4\.0/);
    const pj = JSON.parse(read("package.json"));
    expect(cl).toContain(pj.version);
  });

  it("CI workflow runs npm test", () => {
    expect(exists(".github/workflows/ci.yml")).toBe(true);
    const yml = read(".github/workflows/ci.yml");
    expect(yml).toMatch(/npm test/);
    expect(yml).toMatch(/npm run doctor/);
    expect(yml).toMatch(/npm run validate/);
  });

  it("package and plugin point at live GitHub identity", () => {
    const pkg = JSON.parse(read("package.json"));
    const plugin = JSON.parse(read("plugin.json"));
    expect(pkg.repository?.url || pkg.repository).toMatch(/Kyou12138\/oh-my-grok/);
    expect(plugin.homepage).toMatch(/Kyou12138\/oh-my-grok/);
    expect(plugin.repository).toMatch(/Kyou12138\/oh-my-grok/);
    expect(pkg.keywords).toEqual(expect.arrayContaining(["grok-build", "superpowers", "ultrawork"]));
  });
});

describe("wow path still backed by shipped harness", () => {
  function cfg(pluginData: string): EnvConfig {
    return {
      pluginRoot: root,
      pluginData,
      grokHome: pluginData,
      stateDirName: ".omg",
      skillGate: false,
      intentGate: true,
      planMode: true,
      hashline: false,
      diagEnforce: false,
      hardOrchestration: true,
      maxRalphIter: 10,
      todoCooldownMs: 0,
      todoAbortWindowMs: 0,
      diagCommand: "",
      diagTimeoutMs: 5000,
      hashlineTtlMs: 30 * 60 * 1000,
      commentChecker: false,
      commentCheckerDeny: false,
      agentGuard: false,
    };
  }

  it("detects ultrawork / ralph commands used in README", () => {
    expect(detectRalphCommand("ultrawork fix the failing tests").action).toBe("start-ulw");
    expect(detectRalphCommand('/ralph-loop "ship the login bugfix"').action).toBe("start-ralph");
  });

  it("Stop continues when ULW active without DONE", () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "omg-star-"));
    try {
      const data = path.join(ws, "pdata");
      const c = cfg(data);
      const input: HookInput = {
        raw: {},
        event: "stop",
        sessionId: "star-wow",
        cwd: ws,
        workspaceRoot: ws,
      };
      startRalph(input, c, "fix tests", "ulw");
      const out = handleStop(input, c);
      expect(out).toMatchObject({ decision: "block" });
      expect(JSON.stringify(out)).toMatch(/ULW|RALPH|continue|phase/i);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  it("DONE marker helper matches README completion markers", () => {
    expect(isDoneMessage("all good <promise>DONE</promise>")).toBe(true);
    expect(isDoneMessage("still working")).toBe(false);
  });
});
