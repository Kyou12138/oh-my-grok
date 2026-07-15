/**
 * dist/cli.js fail-open e2e (MAGI v0.28) — real child process, real exit codes.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repoRoot, "dist", "cli.js");
const tmpRoots: string[] = [];

function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-cli-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function runCli(
  event: string,
  stdin: string,
  env: Record<string, string | undefined> = {},
): { status: number | null; stdout: string; stderr: string } {
  const data = tmpDir();
  const r = spawnSync(process.execPath, [cli, event], {
    input: stdin,
    encoding: "utf8",
    env: {
      ...process.env,
      GROK_PLUGIN_ROOT: repoRoot,
      GROK_PLUGIN_DATA: data,
      GROK_SESSION_ID: "cli-test",
      GROK_WORKSPACE_ROOT: data,
      ...env,
    },
    timeout: 15_000,
  });
  return {
    status: r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

describe("cli fail-open e2e", () => {
  it("dist/cli.js exists", () => {
    expect(fs.existsSync(cli)).toBe(true);
  });

  it("unknown event → exit 0 + empty object", () => {
    const r = runCli("not-a-real-event", "{}");
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe("{}");
    expect(r.stderr).toMatch(/unknown event/i);
  });

  it("empty stdin session-start → exit 0 + SISYPHUS context", () => {
    const r = runCli("session-start", "");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/additionalContext|SISYPHUS|SessionStart/i);
  });

  it("malformed stdin JSON → fail-open exit 0 (not crash)", () => {
    const r = runCli("stop", "{{{not json");
    expect(r.status).toBe(0);
    // parse returns {_parseError}; stop handler still runs → {}
    expect(r.stdout.trim().length).toBeGreaterThan(0);
  });

  it("pre-tool-use allow on clean Write path", () => {
    const payload = JSON.stringify({
      session_id: "cli-test",
      tool_name: "Read",
      tool_input: { path: "README.md" },
    });
    const r = runCli("pre-tool-use", payload);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/"decision"\s*:\s*"allow"/);
  });

  it("user-prompt injects context", () => {
    const r = runCli(
      "user-prompt",
      JSON.stringify({ prompt: "hello world", session_id: "cli-test" }),
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/additionalContext|OMG_/);
  });
});
