/**
 * protocol/parse.ts (MAGI v0.27) — fail-open field normalization matrix.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseHookInput, unwrapToolInput } from "../src/protocol/parse.js";
import { pathsFromToolInput } from "../src/features/tool-paths.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import type { EnvConfig } from "../src/protocol/types.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ENV_KEYS = [
  "GROK_SESSION_ID",
  "GROK_WORKSPACE_ROOT",
  "GROK_AGENT_NAME",
  "OMG_AGENT_ROLE",
] as const;

const prev: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    prev[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
});

describe("parseHookInput", () => {
  it("normalizes session and tool fields (snake_case)", () => {
    const input = parseHookInput("pre-tool-use", {
      session_id: "s1",
      cwd: "D:/proj",
      tool_name: "Write",
      tool_input: { file_path: "a.ts" },
    });
    expect(input.sessionId).toBe("s1");
    expect(input.toolName).toBe("Write");
    expect(input.toolInput?.file_path).toBe("a.ts");
    expect(input.cwd).toBe("D:/proj");
    expect(input.workspaceRoot).toBe("D:/proj");
  });

  it("parses string tool_input JSON", () => {
    const input = parseHookInput("post-tool-read", {
      sessionId: "x",
      toolName: "Read",
      toolInput: JSON.stringify({ path: "SKILL.md" }),
    });
    expect(input.toolInput?.path).toBe("SKILL.md");
  });

  it("malformed tool_input string → { raw } fail-open", () => {
    const input = parseHookInput("pre-tool-use", {
      tool_input: "not-json{",
    });
    expect(input.toolInput).toEqual({ raw: "not-json{" });
  });

  it("array tool_input ignored (not object)", () => {
    const input = parseHookInput("pre-tool-use", {
      tool_input: ["a", "b"],
    });
    expect(input.toolInput).toBeUndefined();
  });

  it("defaults sessionId to default when absent", () => {
    delete process.env.GROK_SESSION_ID;
    const input = parseHookInput("stop", {});
    expect(input.sessionId).toBe("default");
  });

  it("env GROK_SESSION_ID / GROK_WORKSPACE_ROOT fill gaps", () => {
    process.env.GROK_SESSION_ID = "env-sess";
    process.env.GROK_WORKSPACE_ROOT = "D:/from-env";
    const input = parseHookInput("user-prompt", { prompt: "hi" });
    expect(input.sessionId).toBe("env-sess");
    expect(input.workspaceRoot).toBe("D:/from-env");
    expect(input.prompt).toBe("hi");
  });

  it("agentName from raw + env aliases", () => {
    delete process.env.GROK_AGENT_NAME;
    delete process.env.OMG_AGENT_ROLE;
    expect(
      parseHookInput("pre-tool-use", { agent_name: "oracle" }).agentName,
    ).toBe("oracle");
    expect(
      parseHookInput("pre-tool-use", { subagent_type: "explore" }).agentName,
    ).toBe("explore");
    process.env.OMG_AGENT_ROLE = "metis";
    expect(parseHookInput("pre-tool-use", {}).agentName).toBe("metis");
  });

  it("stop fields: lastAssistantMessage + stopReason aliases", () => {
    const input = parseHookInput("stop", {
      last_assistant_message: "ok",
      stop_reason: "end_turn",
    });
    expect(input.lastAssistantMessage).toBe("ok");
    expect(input.stopReason).toBe("end_turn");
  });

  it("isFirstPrompt truthy aliases", () => {
    expect(
      parseHookInput("user-prompt", { is_first_prompt: true }).isFirstPrompt,
    ).toBe(true);
    expect(parseHookInput("user-prompt", { firstPrompt: 1 }).isFirstPrompt).toBe(
      true,
    );
    expect(parseHookInput("user-prompt", {}).isFirstPrompt).toBe(false);
  });

  it("toolOutput aliases", () => {
    expect(
      parseHookInput("post-tool-shell", { tool_output: "out" }).toolOutput,
    ).toBe("out");
    expect(parseHookInput("post-tool-shell", { result: "r" }).toolOutput).toBe(
      "r",
    );
  });

  it("Grok host toolResult (string + object) → toolOutput", () => {
    expect(
      parseHookInput("post-tool-spawn", { toolResult: "spawned ok" }).toolOutput,
    ).toBe("spawned ok");
    const obj = parseHookInput("post-tool-read", {
      toolResult: { content: "file body", lineCount: 3 },
    });
    expect(obj.toolOutput).toContain("file body");
    expect(obj.toolOutput).toContain("lineCount");
  });

  it("subagentType camelCase + snake_case on subagent events", () => {
    expect(
      parseHookInput("subagent-start", { subagentType: "explore" }).subagentType,
    ).toBe("explore");
    expect(
      parseHookInput("subagent-end", { subagent_type: "oracle" }).subagentType,
    ).toBe("oracle");
    // also fills agentName when host only sends subagentType
    expect(
      parseHookInput("subagent-start", { subagentType: "hephaestus" }).agentName,
    ).toBe("hephaestus");
  });

  it("preserves raw payload", () => {
    const raw = { session_id: "z", custom: 42 };
    const input = parseHookInput("session-start", raw);
    expect(input.raw).toBe(raw);
    expect(input.event).toBe("session-start");
  });
});

describe("unwrapToolInput nested envelopes (v1.1.42)", () => {
  it("unwraps arguments / parameters / input bags", () => {
    expect(
      unwrapToolInput({ arguments: { path: "src/a.ts", contents: "x" } }),
    ).toEqual({ path: "src/a.ts", contents: "x" });
    expect(
      unwrapToolInput({ parameters: { file_path: "b.ts", content: "y" } }),
    ).toEqual({ file_path: "b.ts", content: "y" });
    expect(
      unwrapToolInput({ input: { command: ["npm", "test"] } }),
    ).toEqual({ command: ["npm", "test"] });
  });

  it("unwraps double nesting", () => {
    expect(
      unwrapToolInput({
        arguments: { parameters: { path: "deep.ts", old_string: "a", new_string: "b" } },
      }),
    ).toEqual({ path: "deep.ts", old_string: "a", new_string: "b" });
  });

  it("keeps flat envelopes unchanged", () => {
    const flat = { path: "a.ts", contents: "z" };
    expect(unwrapToolInput(flat)).toBe(flat);
  });

  it("parseHookInput surfaces nested path for path gates", () => {
    const input = parseHookInput("pre-tool-use", {
      sessionId: "n1",
      cwd: "D:/proj",
      toolName: "Write",
      toolInput: { arguments: { path: "src/nested.ts", contents: "export {}\n" } },
    });
    expect(input.toolInput?.path).toBe("src/nested.ts");
    expect(pathsFromToolInput(input.toolInput)).toEqual(["src/nested.ts"]);
  });

  it("workspaceBoundaryDeny sees nested absolute escape via parse", () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "omg-unwrap-"));
    try {
      const cfg: EnvConfig = {
        pluginRoot: process.cwd(),
        pluginData: path.join(ws, "pdata"),
        grokHome: path.join(ws, "pdata"),
        stateDirName: ".omg",
        skillGate: false,
        intentGate: true,
        planMode: false,
        hashline: false,
        diagEnforce: false,
        hardOrchestration: false,
        maxRalphIter: 10,
        todoCooldownMs: 0,
        todoAbortWindowMs: 0,
        todoMaxContinues: 20,
        todoMaxStagnation: 3,
        diagCommand: "",
        diagTimeoutMs: 5000,
        hashlineTtlMs: 1e9,
        commentChecker: false,
        commentCheckerDeny: false,
        agentGuard: false,
        categoryDiscipline: false,
      };
      const parsed = parseHookInput("pre-tool-use", {
        sessionId: "n2",
        cwd: ws,
        workspaceRoot: ws,
        toolName: "Write",
        tool_input: {
          arguments: {
            path: path.join(ws, "..", "escape-out.txt"),
            contents: "pwn\n",
          },
        },
      });
      const r = handlePreToolUse(parsed, cfg);
      expect(r.exitCode).toBe(2);
      expect(JSON.stringify(r.output)).toMatch(/WORKSPACE_BOUNDARY/i);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
