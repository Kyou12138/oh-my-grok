/**
 * Functional gate suite — drives shipped event handlers only.
 * Covers acceptance criteria for edit reliability, plan/boulder, agent/comment, ULW.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { handlePostToolRead, handlePostToolWrite } from "../src/events/post-tool.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handleStop } from "../src/events/stop.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import { annotateLines, lineTag } from "../src/features/hashline.js";
import { loadBoulder } from "../src/features/todo-boulder.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-fn-"));
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
    pluginRoot: root,
    pluginData,
    grokHome: pluginData,
    stateDirName: ".omg",
    skillGate: false,
    intentGate: true,
    planMode: true,
    hashline: true,
    diagEnforce: false,
    hardOrchestration: false,
    maxRalphIter: 10,
    todoCooldownMs: 0,
    todoAbortWindowMs: 0,
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
    diagCommand: "",
    diagTimeoutMs: 5000,
    hashlineTtlMs: 30 * 60 * 1000,
    commentChecker: true,
    commentCheckerDeny: false,
    agentGuard: true,
    ...over,
  };
}

function base(ws: string, over: Partial<HookInput> = {}): HookInput {
  return {
    raw: {},
    event: "pre-tool-use",
    sessionId: "fn-sess",
    cwd: ws,
    workspaceRoot: ws,
    ...over,
  };
}

function readFile(ws: string, file: string, c: EnvConfig): void {
  handlePostToolRead(
    base(ws, {
      event: "post-tool-read",
      toolName: "Read",
      toolInput: { path: file },
    }),
    c,
  );
}

describe("hashline PreTool (edit reliability)", () => {
  it("denies StrReplace on existing file without prior Read", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "a.ts");
    fs.writeFileSync(file, "const x = 1;\n", "utf8");
    const c = cfg(data);
    const r = handlePreToolUse(
      base(ws, {
        toolName: "StrReplace",
        toolInput: { path: file, old_string: "const x = 1;", new_string: "const x = 2;" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/Hashline|Read/i);
  });

  it("denies stale old_string after Read when file content differs", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "stale.ts");
    fs.writeFileSync(file, "const live = 1;\n", "utf8");
    const c = cfg(data);
    readFile(ws, file, c);
    const r = handlePreToolUse(
      base(ws, {
        toolName: "StrReplace",
        toolInput: {
          path: file,
          old_string: "const ghost = 99;",
          new_string: "const live = 2;",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/old_string|stale/i);
  });

  it("denies LINE#ID tag mismatch against Read cache", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "tag.ts");
    const body = "alpha line\nbeta line\n";
    fs.writeFileSync(file, body, "utf8");
    const c = cfg(data);
    readFile(ws, file, c);
    const good = lineTag("alpha line");
    const bad = good === "AA" ? "BB" : "AA";
    const r = handlePreToolUse(
      base(ws, {
        toolName: "StrReplace",
        toolInput: {
          path: file,
          old_string: `1#${bad}| alpha line`,
          new_string: "alpha line changed",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/LINE#ID|mismatch/i);
  });

  it("allows LINE#ID anchors when tags match; plain content is match target", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "ok.ts");
    const body = "hello world\n";
    fs.writeFileSync(file, body, "utf8");
    const c = cfg(data);
    readFile(ws, file, c);
    const { tags } = annotateLines(body);
    const r = handlePreToolUse(
      base(ws, {
        toolName: "StrReplace",
        toolInput: {
          path: file,
          old_string: `1#${tags[1]}| hello world`,
          new_string: "hello universe",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
    expect(r.output).toMatchObject({ decision: "allow" });
  });

  it("denies LINE#ID when line body after tag does not match file line", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "body.ts");
    const body = "real content\n";
    fs.writeFileSync(file, body, "utf8");
    const c = cfg(data);
    readFile(ws, file, c);
    const tag = lineTag("real content");
    const r = handlePreToolUse(
      base(ws, {
        toolName: "StrReplace",
        toolInput: {
          path: file,
          old_string: `1#${tag}| forged content`,
          new_string: "x",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/LINE#ID|body|mismatch|stale|not found/i);
  });

  it("denies Write overwrite of existing file without Read", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "exist.ts");
    fs.writeFileSync(file, "export const a = 1;\n", "utf8");
    const c = cfg(data);
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: { path: file, contents: "export const a = 2;\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/Hashline|Read/i);
  });
});

describe("plan-mode + boulder Stop", () => {
  it("denies non-plan writes while plan-mode active", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false });
    handleUserPrompt(base(ws, { event: "user-prompt", prompt: '/plan "oauth"' }), c);
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: { path: path.join(ws, "src/app.ts"), contents: "x" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/plan-mode|plans/i);
  });

  it("allows writes under .omg/plans/ in plan-mode", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false });
    handleUserPrompt(base(ws, { event: "user-prompt", prompt: '/plan "topic"' }), c);
    const planFile = path.join(ws, ".omg", "plans", "draft.md");
    fs.mkdirSync(path.dirname(planFile), { recursive: true });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: { path: planFile, contents: "# plan\n- [ ] step\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("/start-work activates boulder; Stop blocks with boulder reason", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false });
    handleUserPrompt(base(ws, { event: "user-prompt", prompt: '/plan "ship api"' }), c);
    // plan-review gate: stamp review evidence
    const plans = path.join(ws, ".omg", "plans");
    const f = fs.readdirSync(plans).find((n) => n.endsWith(".md"))!;
    fs.appendFileSync(
      path.join(plans, f),
      "\n## Steps\n- [ ] 1. Ship API\n\n## Review\n- [x] Metis gap check done\n- [x] Momus VERDICT: PASS\n",
      "utf8",
    );
    handleUserPrompt(base(ws, { event: "user-prompt", prompt: "/start-work" }), c);
    const b = loadBoulder(base(ws), c);
    expect(b?.active).toBe(true);
    const stop = handleStop(base(ws, { event: "stop", lastAssistantMessage: "paused" }), c);
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/BOULDER|plan/i);
  });

  it("Stop blocks on open plan checkboxes under .omg/plans/", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false, planMode: true });
    const plans = path.join(ws, ".omg", "plans");
    fs.mkdirSync(plans, { recursive: true });
    fs.writeFileSync(
      path.join(plans, "open.md"),
      "# Plan\n\n- [ ] still open\n- [x] done\n",
      "utf8",
    );
    // no boulder — checkbox fallback
    const stop = handleStop(base(ws, { event: "stop" }), c);
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/CHECKBOX|PLAN|open/i);
  });

  it("boulder + open checkboxes both surface on Stop", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false });
    handleUserPrompt(base(ws, { event: "user-prompt", prompt: '/plan "feat"' }), c);
    const plans = path.join(ws, ".omg", "plans");
    const f = fs.readdirSync(plans).find((n) => n.endsWith(".md"))!;
    const planPath = path.join(plans, f);
    fs.appendFileSync(
      planPath,
      "\n## Steps\n- [ ] 1. Implement feat\n\n## Review\n- [x] Metis done\n- [x] Momus VERDICT: PASS\n",
      "utf8",
    );
    handleUserPrompt(base(ws, { event: "user-prompt", prompt: "/start-work" }), c);
    const b = loadBoulder(base(ws), c);
    // ensure open checkbox remains in plans (keep review markers so boulder stays meaningful)
    if (b?.planPath && fs.existsSync(b.planPath)) {
      fs.writeFileSync(
        b.planPath,
        "# Plan\n\n- [ ] remaining\n\n## Review\n- [x] Metis done\n- [x] Momus VERDICT: PASS\n",
        "utf8",
      );
    }
    const stop = handleStop(base(ws, { event: "stop" }), c);
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/BOULDER/i);
  });

  it("/cancel-boulder clears active boulder", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false });
    handleUserPrompt(base(ws, { event: "user-prompt", prompt: '/plan "x"' }), c);
    const plans = path.join(ws, ".omg", "plans");
    const f = fs.readdirSync(plans).find((n) => n.endsWith(".md"))!;
    fs.appendFileSync(
      path.join(plans, f),
      "\n## Steps\n- [ ] 1. Do work\n\n## Review\n- [x] Metis done\n- [x] Momus VERDICT: PASS\n",
      "utf8",
    );
    handleUserPrompt(base(ws, { event: "user-prompt", prompt: "/start-work" }), c);
    expect(loadBoulder(base(ws), c)?.active).toBe(true);
    handleUserPrompt(base(ws, { event: "user-prompt", prompt: "/cancel-boulder" }), c);
    expect(loadBoulder(base(ws), c)).toBeNull();
  });
});

describe("agent-guard + comment-checker (discipline)", () => {
  it("denies Write for oracle when agentName present", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        agentName: "oracle",
        toolInput: { path: path.join(ws, "x.ts"), contents: "export {}\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/AGENT_GUARD|read-only|oracle/i);
  });

  it("fails open (allows) when agent role is absent", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false, agentGuard: true });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: { path: path.join(ws, "main.ts"), contents: "export const n = 1;\n" },
      }),
      c,
    );
    expect(r.exitCode).toBe(0);
  });

  it("hard-denies AI-slop comments when commentCheckerDeny", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, {
      hashline: false,
      commentChecker: true,
      commentCheckerDeny: true,
    });
    const r = handlePreToolUse(
      base(ws, {
        toolName: "Write",
        toolInput: {
          path: path.join(ws, "slop.ts"),
          contents: "// This function calculates the total\nexport const t = 1;\n",
        },
      }),
      c,
    );
    expect(r.exitCode).toBe(2);
    expect(JSON.stringify(r.output)).toMatch(/COMMENT_CHECKER|slop/i);
  });

  it("soft-warns AI-slop on post-write without deny", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const file = path.join(ws, "soft.ts");
    const c = cfg(data, {
      hashline: false,
      commentChecker: true,
      commentCheckerDeny: false,
    });
    const out = handlePostToolWrite(
      base(ws, {
        event: "post-tool-write",
        toolName: "Write",
        toolInput: {
          path: file,
          contents: "// This method handles auth\nexport function auth() {}\n",
        },
      }),
      c,
    );
    expect("additionalContext" in out && out.additionalContext).toMatch(
      /COMMENT_CHECKER|slop/i,
    );
  });
});

describe("ULW/Ralph wow loop regression", () => {
  it("mid-sentence ulw starts loop; Stop blocks without DONE", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false });
    handleUserPrompt(
      base(ws, { event: "user-prompt", prompt: "please ulw fix the flaky suite" }),
      c,
    );
    const stop = handleStop(
      base(ws, { event: "stop", lastAssistantMessage: "still working" }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/ULW|RALPH|phase|continue/i);
  });

  it("rejects DONE without evidence on ULW", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false });
    handleUserPrompt(
      base(ws, { event: "user-prompt", prompt: "/ulw-loop ship it" }),
      c,
    );
    const stop = handleStop(
      base(ws, {
        event: "stop",
        lastAssistantMessage:
          "ULTRAWORK MODE ENABLED!\ndone <promise>DONE</promise>",
      }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(/DONE REJECTED|evidence|VERIFIED/i);
  });

  it("rejects skip-ceremony fluff on ULW (v1.1.49)", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false });
    handleUserPrompt(
      base(ws, { event: "user-prompt", prompt: "/ulw-loop ship it" }),
      c,
    );
    const stop = handleStop(
      base(ws, {
        event: "stop",
        lastAssistantMessage: "ok looking into it",
      }),
      c,
    );
    expect(stop).toMatchObject({ decision: "block" });
    expect(JSON.stringify(stop)).toMatch(
      /开场仪式未完成|CEREMONY INCOMPLETE|OPENING RITUAL/i,
    );
  });

  it("PreTool denies Write before ULW ceremony (v1.1.58)", () => {
    const ws = tmpWorkspace();
    const data = path.join(ws, "pdata");
    const c = cfg(data, { hashline: false, skillGate: false });
    handleUserPrompt(
      base(ws, { event: "user-prompt", prompt: "/ulw-loop ship it" }),
      c,
    );
    const pre = handlePreToolUse(
      base(ws, {
        event: "pre-tool-use",
        toolName: "Write",
        toolInput: { path: "x.ts", content: "export {}" },
      }),
      c,
    );
    expect(pre.output.decision).toBe("deny");
    expect(pre.output.reason).toMatch(
      /开场仪式未完成|CEREMONY INCOMPLETE|OPENING RITUAL/i,
    );
  });
});

describe("CLI entry path (dist/cli.js)", () => {
  it("pre-tool-use deny for oracle write via stdin JSON", () => {
    const cli = path.join(root, "dist", "cli.js");
    if (!fs.existsSync(cli)) return; // build required; ci builds first
    const ws = tmpWorkspace();
    const payload = JSON.stringify({
      sessionId: "cli-fn",
      cwd: ws,
      workspaceRoot: ws,
      toolName: "Write",
      agentName: "explore",
      toolInput: { path: path.join(ws, "z.ts"), contents: "1" },
    });
    const r = spawnSync(process.execPath, [cli, "pre-tool-use"], {
      input: payload,
      encoding: "utf8",
      env: {
        ...process.env,
        GROK_PLUGIN_ROOT: root,
        GROK_PLUGIN_DATA: path.join(ws, "pdata"),
        OMG_HASHLINE: "0",
        OMG_SKILL_GATE: "0",
        OMG_AGENT_GUARD: "1",
      },
    });
    // exit 2 = deny
    expect(r.status).toBe(2);
    expect(r.stdout + r.stderr).toMatch(/deny|AGENT_GUARD|read-only|explore/i);
  });
});
