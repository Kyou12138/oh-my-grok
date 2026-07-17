/**
 * ralph / ulw loop feature suite — MAGI 螺旋 8, v0.15
 *
 * 全部直驱 src/features/ralph.ts 导出函数(不经 handleStop/handleUserPrompt),
 * 沿用 stop-orchestration.test.ts 的 makeCtx(idx) 隔离:每 it 独立 tmpWorkspace
 * + 独立 tmpDataRoot + 唯一 sessionId;afterEach 递归清理。
 *
 * 关键区分:
 * - isDoneMessage / applyGoalDoneMarkers 在 v0.15 修复,断言修复后正确行为。
 * - v0.18 已修: parseGoals 尾分号/单字符数字目标、detectRalph ulw- 连字符、
 *   isVerifyShellCommand echo 段拒绝。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { markVerified } from "../src/features/diagnostics.js";
import {
  activityFingerprint,
  advancePhaseFromActivity,
  applyGoalDoneMarkers,
  bumpRalph,
  cancelRalph,
  detectRalphCommand,
  goalsFromTask,
  hasUlwCeremonyOpener,
  isDoneMessage,
  isVerifyShellCommand,
  loadRalph,
  loadUlwActivity,
  markVerifyReached,
  noteUlwRead,
  noteUlwShell,
  noteUlwWrite,
  openGoals,
  parseGoalsFromTask,
  processLoopStop,
  resetUlwActivity,
  saveRalph,
  startRalph,
  ulwCeremonyBanner,
  ulwCeremonyIncompleteReason,
  ulwCeremonyPreDeny,
  ulwDoneGate,
  writeUlwCeremonyFile,
  type RalphState,
} from "../src/features/ralph.js";
import { handlePreToolUse } from "../src/events/pre-tool-use.js";
import { handleUserPrompt } from "../src/events/user-prompt.js";
import type { EnvConfig, HookInput } from "../src/protocol/types.js";

const tmpRoots: string[] = [];

function tmpWorkspace(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-ralph-"));
  tmpRoots.push(d);
  return d;
}

function tmpDataRoot(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "omg-ralph-data-"));
  tmpRoots.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpRoots.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

interface Ctx {
  ws: string;
  data: string;
  cfg: EnvConfig;
  sessionId: string;
}

/** 单 it 完整隔离上下文:唯一 workspace + pluginData + sessionId。 */
function makeCtx(idx: number, over: Partial<EnvConfig> = {}): Ctx {
  const ws = tmpWorkspace();
  const data = tmpDataRoot();
  const sessionId = `ralph-${idx}-${Math.random().toString(36).slice(2, 8)}`;
  const cfg: EnvConfig = {
    pluginRoot: process.cwd(),
    pluginData: data,
    grokHome: data,
    stateDirName: ".omg",
    skillGate: false,
    intentGate: true,
    planMode: true,
    hashline: false,
    diagEnforce: true,
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
    categoryDiscipline: false,
    todoMaxContinues: 20,
    todoMaxStagnation: 3,
    ...over,
  };
  return { ws, data, cfg, sessionId };
}

function stopInput(ctx: Ctx, msg: string): HookInput {
  return {
    raw: {},
    event: "stop",
    sessionId: ctx.sessionId,
    cwd: ctx.ws,
    workspaceRoot: ctx.ws,
    lastAssistantMessage: msg,
  };
}

// ─── 1. isDoneMessage 真值表(v0.15 修复) ─────────────────────────────
describe("isDoneMessage 真值表(v0.15 否定集修复)", () => {
  it("正例:四个完成标记任一出现均 true", () => {
    expect(isDoneMessage("<promise>DONE</promise>")).toBe(true);
    expect(isDoneMessage("<promise>done</promise>")).toBe(true);
    expect(isDoneMessage("RALPH_DONE")).toBe(true);
    expect(isDoneMessage("ULW_DONE")).toBe(true);
  });

  it("正例:标记嵌入正常句子仍 true", () => {
    expect(isDoneMessage("工作完成 <promise>DONE</promise>")).toBe(true);
    expect(isDoneMessage("all green, RALPH_DONE")).toBe(true);
  });

  it("负例:'not ULW_DONE' 不得判完成(v0.15 修复前会误 true)", () => {
    expect(isDoneMessage("not ULW_DONE")).toBe(false);
    expect(isDoneMessage("this is not ULW_DONE")).toBe(false);
  });

  it("负例:'NOT <promise>DONE</promise>' 不得判完成", () => {
    expect(isDoneMessage("NOT <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("I will NOT <promise>DONE</promise> yet")).toBe(false);
  });

  it("负例:'will never mark RALPH_DONE' 不得判完成", () => {
    expect(isDoneMessage("I will never mark RALPH_DONE")).toBe(false);
    expect(isDoneMessage("never RALPH_DONE")).toBe(false);
  });

  it("负例:'without ULW_DONE we stop' 不得判完成", () => {
    expect(isDoneMessage("without ULW_DONE we stop")).toBe(false);
  });

  it("负例:'no ULW_DONE yet' 不得判完成", () => {
    expect(isDoneMessage("no ULW_DONE yet")).toBe(false);
  });

  it("负例:缩写否定 don't/isn't/...n't + 标记不得判完成", () => {
    expect(isDoneMessage("I don't ULW_DONE")).toBe(false);
    expect(isDoneMessage("isn't RALPH_DONE yet")).toBe(false);
    expect(isDoneMessage("we haven't <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("didn't reach ULW_DONE")).toBe(false);
  });

  it("负例:频度否定 rarely/hardly/seldom + 标记不得判完成", () => {
    expect(isDoneMessage("rarely RALPH_DONE")).toBe(false);
    expect(isDoneMessage("hardly ever ULW_DONE")).toBe(false);
    expect(isDoneMessage("seldom <promise>DONE</promise>")).toBe(false);
  });

  it("负例:裸 'done' / 'is done' 词形不算完成标记", () => {
    expect(isDoneMessage("done")).toBe(false);
    expect(isDoneMessage("this is done")).toBe(false);
    expect(isDoneMessage("all done")).toBe(false);
  });

  it("负例:空串 / undefined 返回 false", () => {
    expect(isDoneMessage("")).toBe(false);
  });

  it("负例: partial DONE hedges 不得关闭 loop (v1.1.15)", () => {
    expect(isDoneMessage("ULW_DONE except remaining goals")).toBe(false);
    expect(isDoneMessage("RALPH_DONE but still incomplete")).toBe(false);
    expect(isDoneMessage("almost ULW_DONE")).toBe(false);
    expect(isDoneMessage("<promise>DONE</promise> however failing tests")).toBe(
      false,
    );
    expect(isDoneMessage("未标记 ULW_DONE")).toBe(false);
    expect(isDoneMessage("ULW_DONE 还没完成")).toBe(false);
    expect(isDoneMessage(undefined)).toBe(false);
  });

  it("负例: cannot/unable/impossible/refuse/missing 话术不得关 loop (v1.1.28)", () => {
    expect(isDoneMessage("cannot mark ULW_DONE")).toBe(false);
    expect(isDoneMessage("Unable to claim ULW_DONE")).toBe(false);
    expect(isDoneMessage("far from ULW_DONE")).toBe(false);
    expect(isDoneMessage("I refuse to put ULW_DONE")).toBe(false);
    expect(isDoneMessage("still missing ULW_DONE")).toBe(false);
    expect(isDoneMessage("It is impossible to mark RALPH_DONE now")).toBe(
      false,
    );
    expect(isDoneMessage("can't claim <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("无法 ULW_DONE")).toBe(false);
    expect(isDoneMessage("不能 RALPH_DONE")).toBe(false);
    expect(isDoneMessage("没法 ULW_DONE")).toBe(false);
  });

  it("负例: future/deferred DONE 不得关 loop (v1.1.45)", () => {
    expect(isDoneMessage("I will put <promise>DONE</promise> later")).toBe(
      false,
    );
    expect(isDoneMessage("going to mark ULW_DONE after tests")).toBe(false);
    expect(isDoneMessage("pending <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("skip ULW_DONE for now")).toBe(false);
    expect(isDoneMessage("TODO: add <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("will RALPH_DONE once CI is green")).toBe(false);
    expect(isDoneMessage("<promise>DONE</promise> later tonight")).toBe(false);
    expect(isDoneMessage("稍后 ULW_DONE")).toBe(false);
    expect(isDoneMessage("ULW_DONE 之后再改")).toBe(false);
    // still accept real completion claims
    expect(isDoneMessage("All green. <promise>DONE</promise>")).toBe(true);
    expect(isDoneMessage("工作完成 RALPH_DONE")).toBe(true);
  });

  it("负例: provisional DONE for now / soft / effectively / marked (v1.1.55)", () => {
    expect(isDoneMessage("<promise>DONE</promise> for now")).toBe(false);
    expect(isDoneMessage("<promise>DONE</promise> for today")).toBe(false);
    expect(isDoneMessage("<promise>DONE</promise> temporarily")).toBe(false);
    expect(isDoneMessage("<promise>DONE</promise>-ish")).toBe(false);
    expect(isDoneMessage("<promise>DONE</promise> (WIP)")).toBe(false);
    expect(isDoneMessage("<promise>DONE</promise> wip")).toBe(false);
    expect(isDoneMessage("soft <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("effectively <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("functionally ULW_DONE")).toBe(false);
    expect(isDoneMessage("provisionally RALPH_DONE")).toBe(false);
    expect(isDoneMessage("consider <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("treat as <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("marked <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("marked as ULW_DONE")).toBe(false);
    expect(isDoneMessage("marking <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("I'll mark <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("shipped as <promise>DONE</promise>")).toBe(false);
    expect(isDoneMessage("<promise>DONE</promise> shipped")).toBe(false);
    expect(isDoneMessage("Verified end-to-end. <promise>DONE</promise>")).toBe(
      true,
    );
  });
});

// ─── 2. parseGoalsFromTask ──────────────────────────────────────────
describe("parseGoalsFromTask 多目标解析", () => {
  it("分号分隔 'a; b; c' → [a,b,c]", () => {
    expect(parseGoalsFromTask("a; b; c")).toEqual(["a", "b", "c"]);
  });

  it("竖线分隔 'a | b | c' → [a,b,c]", () => {
    expect(parseGoalsFromTask("a | b | c")).toEqual(["a", "b", "c"]);
  });

  it("数字标记单字符目标 '1) a 2) b' → [a,b] (v0.18 修单字符吞并)", () => {
    expect(parseGoalsFromTask("1) a 2) b")).toEqual(["a", "b"]);
    expect(parseGoalsFromTask("1. a 2. b")).toEqual(["a", "b"]);
  });

  it("数字标记多字符目标 '1) alpha 2) beta' → [alpha,beta]", () => {
    expect(parseGoalsFromTask("1) alpha 2) beta")).toEqual(["alpha", "beta"]);
  });

  it("单目标原样返回", () => {
    expect(parseGoalsFromTask("refactor login module")).toEqual([
      "refactor login module",
    ]);
  });

  it("空串 → ['continue work'] 默认任务", () => {
    expect(parseGoalsFromTask("")).toEqual(["continue work"]);
    expect(parseGoalsFromTask("   ")).toEqual(["continue work"]);
  });

  it("尾分号 'a;' → ['a'] (v0.18 剥离尾部分隔符)", () => {
    expect(parseGoalsFromTask("a;")).toEqual(["a"]);
    expect(parseGoalsFromTask("solo |")).toEqual(["solo"]);
  });

  it("分号优先于竖线 'a | b ; c' → ['a | b','c']", () => {
    expect(parseGoalsFromTask("a | b ; c")).toEqual(["a | b", "c"]);
  });

  it("goalsFromTask 赋 id g1/g2 且 done=false", () => {
    const gs = goalsFromTask("a; b");
    expect(gs).toEqual([
      { id: "g1", text: "a", done: false },
      { id: "g2", text: "b", done: false },
    ]);
  });
});

// ─── 3. applyGoalDoneMarkers(v0.15 收紧) ─────────────────────────────
describe("applyGoalDoneMarkers(v0.15 收紧:删反向 includes + 超短 marker 精确)", () => {
  function fresh(goals: string[]): RalphState {
    return {
      schemaVersion: 3,
      active: true,
      mode: "ulw",
      task: goals.join("; "),
      goals: goalsFromTask(goals.join("; ")),
      iteration: 0,
      maxIterations: 50,
      createdAt: new Date().toISOString(),
      phase: "explore",
      phaseReached: { explore: false, implement: false, verify: false },
      stallCount: 0,
      lastActivityAt: new Date().toISOString(),
      lastActivityFingerprint: "",
    };
  }

  it("marker 'login' 是 'refactor login module' 子串 → 标记该 goal done", () => {
    const s = fresh(["refactor login module", "add tests"]);
    applyGoalDoneMarkers(s, "GOAL_DONE: login");
    expect(s.goals[0].done).toBe(true);
    expect(s.goals[1].done).toBe(false);
  });

  it("精确相等大小写不敏感:marker 与 goal 全文一致 → done", () => {
    const s = fresh(["Refactor Login Module"]);
    applyGoalDoneMarkers(s, "GOAL_DONE: refactor login module");
    expect(s.goals[0].done).toBe(true);
  });

  it("超短 marker 'a' vs 多 goal → 都不 done(v0.15 修复:删反向 + >3 门限)", () => {
    const s = fresh(["refactor login module", "add tests"]);
    // marker 'a' 长度 1,既不精确相等也不满足 >3,两 goal 都不应被误标
    applyGoalDoneMarkers(s, "GOAL_DONE: a");
    expect(s.goals.every((g) => g.done === false)).toBe(true);
  });

  it("<promise>GOAL:text</promise> 形式也能标记", () => {
    const s = fresh(["refactor login module"]);
    applyGoalDoneMarkers(s, "<promise>GOAL: refactor login module</promise>");
    expect(s.goals[0].done).toBe(true);
  });

  it("空 goals 或空 msg → no-op,返回原引用", () => {
    const sNoGoals: RalphState = { ...fresh([]), goals: [] };
    expect(applyGoalDoneMarkers(sNoGoals, "GOAL_DONE: x")).toBe(sNoGoals);
    const s = fresh(["a goal task"]);
    expect(applyGoalDoneMarkers(s, "")).toBe(s);
    expect(applyGoalDoneMarkers(s, undefined)).toBe(s);
  });

  it("已 done 的 goal 不被重复处理(幂等)", () => {
    const s = fresh(["refactor login module"]);
    s.goals[0].done = true;
    applyGoalDoneMarkers(s, "GOAL_DONE: login");
    expect(s.goals[0].done).toBe(true);
  });

  it("openGoals 过滤出未完成项", () => {
    const s = fresh(["refactor login module", "add tests"]);
    s.goals[0].done = true;
    expect(openGoals(s).map((g) => g.id)).toEqual(["g2"]);
  });
});

// ─── 4. isVerifyShellCommand ─────────────────────────────────────────
describe("isVerifyShellCommand 词边界 + echo 段", () => {
  it("正例:各类测试/校验命令均 true", () => {
    const positives = [
      "npm test",
      "npm run test",
      "npm run ci",
      "pnpm test",
      "yarn test",
      "vitest",
      "jest",
      "pytest",
      "cargo test",
      "go test",
      "dotnet test",
      "mvn test",
      "gradle test",
      "gradlew test",
      "typecheck",
      "tsc --noEmit",
      "eslint",
      "lint",
      "npm run doctor",
      "npm run validate",
      // v1.1.40 modern toolchains
      "bun test",
      "bun run test",
      "deno test",
      "yarn run test",
      "make test",
      // v1.1.47 nextest / task runners / e2e
      "cargo nextest run",
      "just test",
      "task test",
      "npx playwright test",
      "cypress run",
      "tox",
      "hatch test",
      // v1.1.48 mobile / ruby / jvm / bazel
      "flutter test",
      "phpunit",
      "vendor/bin/phpunit",
      "rspec",
      "mix test",
      "sbt test",
      "bazel test //...",
      // v1.1.50 node/python/rails/mono/static
      "node --test",
      "node --test test/",
      "python -m pytest",
      "python -m unittest",
      "python manage.py test",
      "manage.py test",
      "mocha",
      "mocha test/",
      "ava",
      "ava test",
      "pest",
      "vendor/bin/pest",
      "php artisan test",
      "rails test",
      "bin/rails test",
      "rake test",
      "turbo run test",
      "nx test",
      "gotestsum",
      "ginkgo run",
      "zig test",
      "crystal spec",
      "ctest",
      "meson test",
      "mvn verify",
      "cargo clippy",
      "go vet",
      "ruff check",
      "mypy",
      "pyright",
      "biome check",
      "biome ci",
      "tsc -b",
      "tsc --build",
      "vue-tsc --noEmit",
      "npm run typecheck",
      "npm run type-check",
      "npm run types:check",
      "npm run lint",
      "npm run check",
      "pnpm typecheck",
      "pnpm type-check",
      "pnpm lint",
      "yarn typecheck",
      "yarn type-check",
      "bun run typecheck",
      "bun run check",
      "pnpm check-types",
      "yarn check-types",
      "cargo check",
      "turbo run check-types",
      "nx run-many -t check-types",
      "npm run coverage",
      "basedpyright",
      "ty check",
      "pants test ::",
      "buck2 test //...",
      "please test",
      "earthly +test",
      "dagger run test",
      "mise run test",
      "cmake --build build --target test",
      "yarn coverage",
      "composer test",
      "ant test",
      "sbt testOnly *",
      "coverage report",
      "nox -s tests",
      "pixi run test",
      "stylelint '**/*.css'",
      "kubeconform -summary manifests",
      "kubeval",
      "helm lint chart",
      // v1.1.51 dart/swift/mono/fmt-check/audit
      "dart test",
      "dart analyze",
      "swift test",
      "zig build test",
      "flutter analyze",
      "nx run-many -t test",
      "nx affected -t test",
      "turbo test",
      "lerna run test",
      "lein test",
      "stack test",
      "cabal test",
      "make check",
      "just check",
      "task check",
      "xcodebuild test -scheme App",
      "fastlane test",
      "svelte-check",
      "astro check",
      "oxlint .",
      "black --check .",
      "ruff format --check",
      "prettier --check .",
      "staticcheck ./...",
      "cargo fmt --check",
      "cargo audit",
      "python3 -m unittest",
      "poetry run pytest",
      "uv run pytest",
      "hatch run test",
      "tsx --test",
      "npm audit",
      "semgrep scan",
      "bats test/",
      "ng test",
      "ember test",
      "ninja test",
    ];
    for (const cmd of positives) {
      expect(isVerifyShellCommand(cmd), cmd).toBe(true);
    }
  });

  it("verify 负例: cargo fmt / ruff format / nx build 不算校验 (v1.1.51)", () => {
    expect(isVerifyShellCommand("cargo fmt")).toBe(false);
    expect(isVerifyShellCommand("ruff format .")).toBe(false);
    // v1.1.62: --fix is mutate, not verify evidence
    expect(isVerifyShellCommand("ruff check --fix")).toBe(false);
    expect(isVerifyShellCommand("ruff check .")).toBe(true);
    expect(isVerifyShellCommand("nx run-many -t build")).toBe(false);
    expect(isVerifyShellCommand("nx affected -t serve")).toBe(false);
    expect(isVerifyShellCommand("dotnet format")).toBe(false);
  });

  it("verify 正例: terraform / shellcheck / format:check / rubocop (v1.1.52)", () => {
    for (const cmd of [
      "terraform validate",
      "terraform fmt -check",
      "tflint",
      "tfsec",
      "checkov -d .",
      "npm run format:check",
      "npm run fmt:check",
      "shellcheck script.sh",
      "actionlint",
      "hadolint Dockerfile",
      "yamllint .",
      "rubocop",
      "mix credo",
      "mix format --check-formatted",
      "govulncheck ./...",
      "composer audit",
      "bundle audit",
      "typos",
      "codespell",
      "deno check main.ts",
      "deno lint",
      "swiftlint",
      "ktlint",
      "dprint check",
      "opa test",
      "conftest test",
      "dotnet format --verify-no-changes",
      "cargo deny check",
      "nx run-many -t lint",
      "turbo lint",
      "make lint",
      // v1.1.53
      "rustfmt --check",
      "gofmt -l .",
      "go fmt -l .",
      "composer validate",
      "pint --test",
      "php-cs-fixer fix --dry-run",
      // v1.1.54
      "tsc -p tsconfig.json --noEmit",
      "nx run myapp:test",
      "pnpm -r test",
      "pnpm -w test",
      "./gradlew check",
      "detox test",
      "maestro test flows/",
      "cucumber-js features/",
      "behave features/",
      "fastlane scan",
      "bin/rspec",
      // v1.1.55
      "mvn -B test",
      "mvn -B verify",
      "pnpm --filter web test",
      "yarn workspace web test",
      // v1.1.56
      "newman run collection.json",
      "k6 run script.js",
      "artillery run s.yml",
      "cargo tarpaulin",
      "cargo llvm-cov",
      "coverage run -m pytest",
    ]) {
      expect(isVerifyShellCommand(cmd), cmd).toBe(true);
    }
    // build-only nx run must not credit verify
    expect(isVerifyShellCommand("nx run myapp:build")).toBe(false);
  });

  it("bun/deno/yarn-run/make test credit ULW verify via noteUlwShell (v1.1.40)", () => {
    const ctx = makeCtx(40);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "modern verify", "ulw");
    noteUlwShell(input0, ctx.cfg, "bun test");
    expect(loadRalph(input0, ctx.cfg)?.phaseReached.verify).toBe(true);
  });

  it("负例:非校验命令 npm install / git status → false", () => {
    expect(isVerifyShellCommand("npm install")).toBe(false);
    expect(isVerifyShellCommand("git status")).toBe(false);
    expect(isVerifyShellCommand("echo hello")).toBe(false);
    expect(isVerifyShellCommand("ls -la")).toBe(false);
  });

  it("echo/printf 打印测试名不算校验 (v0.18)", () => {
    expect(isVerifyShellCommand("echo npm test")).toBe(false);
    expect(isVerifyShellCommand('printf "vitest"')).toBe(false);
    expect(isVerifyShellCommand("Write-Host lint")).toBe(false);
  });

  it("复合:echo 后真实校验段仍 true (v0.18)", () => {
    expect(isVerifyShellCommand("echo start && npm test")).toBe(true);
    expect(isVerifyShellCommand("npm test && echo done")).toBe(true);
  });

  it("复合命令含校验子命令 'npm test && npm run build' → true", () => {
    expect(isVerifyShellCommand("npm test && npm run build")).toBe(true);
  });

  it("词边界:'npmtesting' 不匹配 npm test → false", () => {
    expect(isVerifyShellCommand("npmtesting")).toBe(false);
  });

  it("空 / undefined → false", () => {
    expect(isVerifyShellCommand("")).toBe(false);
    expect(isVerifyShellCommand(undefined)).toBe(false);
  });
});

// ─── 5. phase 谓词(纯函数无 IO) ──────────────────────────────────────
describe("phase 谓词(纯函数)", () => {
  function freshState(): RalphState {
    return {
      schemaVersion: 3,
      active: true,
      mode: "ulw",
      task: "ship feature",
      goals: goalsFromTask("ship feature"),
      iteration: 0,
      maxIterations: 50,
      createdAt: new Date().toISOString(),
      phase: "explore",
      phaseReached: { explore: false, implement: false, verify: false },
      stallCount: 0,
      lastActivityAt: new Date().toISOString(),
      lastActivityFingerprint: "",
    };
  }

  it("activityFingerprint(r3,w2,s1) → 'r3:w2:s1'", () => {
    expect(
      activityFingerprint({ schemaVersion: 1, reads: 3, writes: 2, shells: 1, lastPaths: [], updatedAt: "" }),
    ).toBe("r3:w2:s1");
    expect(
      activityFingerprint({ schemaVersion: 1, reads: 0, writes: 0, shells: 0, lastPaths: [], updatedAt: "" }),
    ).toBe("r0:w0:s0");
  });

  it("advancePhase:仅 reads → explore reached + phase 推进 implement", () => {
    const s = freshState();
    advancePhaseFromActivity(s, {
      schemaVersion: 1,
      reads: 1,
      writes: 0,
      shells: 0,
      lastPaths: [],
      updatedAt: "",
    });
    expect(s.phaseReached.explore).toBe(true);
    expect(s.phase).toBe("implement");
  });

  it("advancePhase:仅 writes → implement reached + phase 推进 verify", () => {
    const s = freshState();
    advancePhaseFromActivity(s, {
      schemaVersion: 1,
      reads: 0,
      writes: 1,
      shells: 0,
      lastPaths: [],
      updatedAt: "",
    });
    expect(s.phaseReached.implement).toBe(true);
    expect(s.phase).toBe("verify");
  });

  it("advancePhase:shell + implement reached → verify", () => {
    const s = freshState();
    s.phase = "implement";
    s.phaseReached.explore = true;
    s.phaseReached.implement = true;
    advancePhaseFromActivity(s, {
      schemaVersion: 1,
      reads: 0,
      writes: 0,
      shells: 1,
      lastPaths: [],
      updatedAt: "",
    });
    expect(s.phase).toBe("verify");
  });

  it("advancePhase:shell 但未 implement reached → 不推进 verify(锁 ralph.ts:417)", () => {
    const s = freshState();
    s.phase = "implement";
    // implement 仍未 reached(shells 分支门禁 phaseReached.implement)
    advancePhaseFromActivity(s, {
      schemaVersion: 1,
      reads: 0,
      writes: 0,
      shells: 1,
      lastPaths: [],
      updatedAt: "",
    });
    expect(s.phase).toBe("implement");
    expect(s.phaseReached.verify).toBe(false);
  });

  it("advancePhase:零活动 → 状态不变", () => {
    const s = freshState();
    advancePhaseFromActivity(s, {
      schemaVersion: 1,
      reads: 0,
      writes: 0,
      shells: 0,
      lastPaths: [],
      updatedAt: "",
    });
    expect(s.phase).toBe("explore");
    expect(s.phaseReached).toEqual({ explore: false, implement: false, verify: false });
  });

  it("markVerifyReached → verify reached + phase=verify", () => {
    const s = freshState();
    markVerifyReached(s);
    expect(s.phaseReached.verify).toBe(true);
    expect(s.phase).toBe("verify");
  });
});

// ─── 6. detectRalphCommand ───────────────────────────────────────────
describe("detectRalphCommand", () => {
  it("'/ulw-loop' → start-ulw", () => {
    const r = detectRalphCommand("/ulw-loop");
    expect(r.action).toBe("start-ulw");
  });

  it("'/ralph-loop \"x\"' → start-ralph, task=x", () => {
    const r = detectRalphCommand('/ralph-loop "x"');
    expect(r.action).toBe("start-ralph");
    expect(r.task).toBe("x");
  });

  it("'请 ulw 重构' → start-ulw(句中 ulw 命中)", () => {
    expect(detectRalphCommand("请 ulw 重构").action).toBe("start-ulw");
  });

  it("'/cancel-ralph' → cancel", () => {
    expect(detectRalphCommand("/cancel-ralph").action).toBe("cancel");
    expect(detectRalphCommand("cancel-ralph").action).toBe("cancel");
  });

  it("'hello world' → null", () => {
    const r = detectRalphCommand("hello world");
    expect(r.action).toBeNull();
  });

  it("'ulw-stop please' → null (v0.18 连字符不再误启)", () => {
    const r = detectRalphCommand("ulw-stop please");
    expect(r.action).toBeNull();
    expect(r.task).toBe("");
  });

  it("'ulw fix tests' 仍 start-ulw", () => {
    const r = detectRalphCommand("ulw fix tests");
    expect(r.action).toBe("start-ulw");
    expect(r.task).toMatch(/fix tests/i);
  });

  it("'ulw重构登录' CJK 粘连仍 start-ulw", () => {
    const r = detectRalphCommand("ulw重构登录");
    expect(r.action).toBe("start-ulw");
    expect(r.task).toMatch(/重构登录/);
  });
});

// ─── 7. processLoopStop 状态机四分支(直驱,每 it 独立 makeCtx) ────────
describe("processLoopStop 状态机四分支", () => {
  it("DONE-rejected:startRalph ulw + msg含DONE → block + reason含 DONE REJECTED", () => {
    const ctx = makeCtx(0);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship feature", "ulw");
    // 有开场口号但无 explore/implement/verify 证据 → gate 拒
    const out = processLoopStop(
      stopInput(
        ctx,
        "ULTRAWORK MODE ENABLED!\nall done <promise>DONE</promise>",
      ),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(true);
    expect(out.reason).toMatch(/DONE REJECTED/);
    // loop 仍活跃
    expect(loadRalph(input0, ctx.cfg)?.mode).toBe("ulw");
  });

  it("DONE-accept:noteUlwRead+noteUlwWrite 推进 phaseReached + markVerified + VERIFIED+DONE → block=false 且 loadRalph===null", () => {
    const ctx = makeCtx(1);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship feature", "ulw");
    noteUlwRead(input0, ctx.cfg, "a.ts");
    noteUlwWrite(input0, ctx.cfg, "b.ts");
    markVerified(input0, ctx.cfg);
    // v1.1.49: DONE 前须完成开场仪式（第一行口号）
    const out = processLoopStop(
      stopInput(
        ctx,
        "ULTRAWORK MODE ENABLED!\nGoal: ship feature\n<promise>VERIFIED</promise>\n<promise>DONE</promise>",
      ),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(false);
    expect(out.reason).toBe("");
    // cancelRalph 已执行 → 落盘清除
    expect(loadRalph(input0, ctx.cfg)).toBeNull();
  });

  it("max-iter:bumpRalph 预置 iteration 接近 max + msg='working' → block + reason含 max iterations reached", () => {
    const ctx = makeCtx(2, { maxRalphIter: 3 });
    const input0 = stopInput(ctx, "");
    let s = startRalph(input0, ctx.cfg, "ship feature", "ralph");
    // 预置 iteration 到 max(达到上限)
    while (s.iteration < 3) s = bumpRalph(input0, ctx.cfg, s);
    expect(s.iteration).toBe(3);
    const out = processLoopStop(
      stopInput(ctx, "still working"),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(true);
    expect(out.reason).toMatch(/max iterations reached/);
    expect(loadRalph(input0, ctx.cfg)).toBeNull();
  });

  it("STALL:iteration>0 + noRwShell → reason含 STALL DETECTED 且 stallCount>=1", () => {
    const ctx = makeCtx(3);
    const input0 = stopInput(ctx, "");
    // 预置 iteration>0(首停 iter=0 走分支 C 不 stall) + 已完成开场仪式
    let s = startRalph(input0, ctx.cfg, "ship feature", "ulw");
    s.ceremonyOpened = true;
    s = bumpRalph(input0, ctx.cfg, s);
    expect(s.iteration).toBe(1);
    // 无任何 read/write/shell 活动 → noRwShell + iter>0 → stall
    const out = processLoopStop(
      stopInput(ctx, "thinking only"),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(true);
    expect(out.reason).toMatch(/STALL DETECTED/);
    expect(out.state.stallCount).toBeGreaterThanOrEqual(1);
  });

  it("STALL 反例:有 read/write 活动 → reason不含 STALL 且 stallCount=0", () => {
    const ctx = makeCtx(4);
    const input0 = stopInput(ctx, "");
    let s = startRalph(input0, ctx.cfg, "ship feature", "ulw");
    s.ceremonyOpened = true;
    s = bumpRalph(input0, ctx.cfg, s);
    noteUlwRead(input0, ctx.cfg, "a.ts");
    noteUlwWrite(input0, ctx.cfg, "b.ts");
    const out = processLoopStop(
      stopInput(ctx, "progress made"),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(true);
    expect(out.reason).not.toMatch(/STALL DETECTED/);
    expect(out.state.stallCount).toBe(0);
  });

  it("iteration 递增:连调两次 processLoopStop(非 DONE) 1 → 2", () => {
    const ctx = makeCtx(5);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship feature", "ralph");
    const first = processLoopStop(
      stopInput(ctx, "working"),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(first.state.iteration).toBe(1);
    // 重新 noteUlwRead 避免空活动触发非预期分支(此处 ralph 模式不 stall)
    const second = processLoopStop(
      stopInput(ctx, "more work"),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(second.state.iteration).toBe(2);
  });
});

// ─── 8. ulwDoneGate problems 分项 ─────────────────────────────────────
describe("ulwDoneGate evidence problems", () => {
  it("缺 explore+implement → reason含 'No explore/implement evidence'", () => {
    const ctx = makeCtx(6);
    const input0 = stopInput(ctx, "");
    const s = startRalph(input0, ctx.cfg, "single goal task", "ulw");
    const gate = ulwDoneGate(input0, ctx.cfg, s, "<promise>DONE</promise>");
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/No explore\/implement evidence/);
  });

  it("缺 verify → reason含 'verify evidence' 与 'tests passed'", () => {
    const ctx = makeCtx(7);
    const input0 = stopInput(ctx, "");
    const s = startRalph(input0, ctx.cfg, "single goal task", "ulw");
    // 补 explore + implement reached
    s.phaseReached.explore = true;
    s.phaseReached.implement = true;
    saveRalph(input0, ctx.cfg, s);
    const gate = ulwDoneGate(input0, ctx.cfg, s, "<promise>DONE</promise>");
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/verify evidence/);
    expect(gate.reason).toMatch(/tests passed/);
  });

  it("multi-goal 未全 GOAL_DONE → reason含 'open goal(s) remain'", () => {
    const ctx = makeCtx(8);
    const input0 = stopInput(ctx, "");
    const s = startRalph(input0, ctx.cfg, "refactor login; add tests", "ulw");
    s.phaseReached.explore = true;
    s.phaseReached.implement = true;
    s.phaseReached.verify = true;
    markVerified(input0, ctx.cfg);
    saveRalph(input0, ctx.cfg, s);
    const gate = ulwDoneGate(input0, ctx.cfg, s, "<promise>VERIFIED</promise>\n<promise>DONE</promise>");
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/open goal\(s\) remain/);
  });
});

// ─── 9. multi-goal DONE 全链路 ────────────────────────────────────────
describe("multi-goal DONE 全链路", () => {
  it("多 goal 未全 done → 拒(即便 explore/implement/verify 齐)", () => {
    const ctx = makeCtx(9);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "refactor login; add tests", "ulw");
    noteUlwRead(input0, ctx.cfg, "a.ts");
    noteUlwWrite(input0, ctx.cfg, "b.ts");
    markVerified(input0, ctx.cfg);
    const out = processLoopStop(
      stopInput(
        ctx,
        "ULTRAWORK MODE ENABLED!\n<promise>VERIFIED</promise>\n<promise>DONE</promise>",
      ),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(true);
    expect(out.reason).toMatch(/open goal\(s\) remain/);
    expect(loadRalph(input0, ctx.cfg)?.mode).toBe("ulw");
  });

  it("逐个 GOAL_DONE 持久化跨 stop(首个 goal done 落盘)", () => {
    const ctx = makeCtx(10);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "refactor login; add tests", "ulw");
    noteUlwRead(input0, ctx.cfg, "a.ts");
    noteUlwWrite(input0, ctx.cfg, "b.ts");
    // 第一次 stop:仅标记第一个 goal done（含开场口号）
    const first = processLoopStop(
      stopInput(
        ctx,
        "ULTRAWORK MODE ENABLED!\nGOAL_DONE: login\nstill working",
      ),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(first.block).toBe(true);
    // 重载确认持久化:g1 done, g2 open
    const reloaded = loadRalph(input0, ctx.cfg)!;
    expect(reloaded.goals[0].done).toBe(true);
    expect(reloaded.goals[1].done).toBe(false);
  });

  it("全 GOAL_DONE + noteUlwRead+noteUlwWrite + VERIFIED → 接受(block=false, loadRalph===null)", () => {
    const ctx = makeCtx(11);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "refactor login; add tests", "ulw");
    noteUlwRead(input0, ctx.cfg, "a.ts");
    noteUlwWrite(input0, ctx.cfg, "b.ts");
    markVerified(input0, ctx.cfg);
    const out = processLoopStop(
      stopInput(
        ctx,
        "ULTRAWORK MODE ENABLED!\nGOAL_DONE: login\nGOAL_DONE: add tests\n<promise>VERIFIED</promise>\n<promise>DONE</promise>",
      ),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(false);
    expect(loadRalph(input0, ctx.cfg)).toBeNull();
  });
});

// ─── 10. noteUlwShell 联动 + activity 累积 ────────────────────────────
describe("noteUlwShell 联动 + activity 累积", () => {
  it("noteUlwShell('npm test') → markVerifyReached 持久化(phaseReached.verify 落盘 true)", () => {
    const ctx = makeCtx(12);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship feature", "ulw");
    noteUlwShell(input0, ctx.cfg, "npm test");
    const reloaded = loadRalph(input0, ctx.cfg)!;
    expect(reloaded.phaseReached.verify).toBe(true);
    expect(reloaded.phase).toBe("verify");
    // activity 也累计 shells
    const act = loadUlwActivity(input0, ctx.cfg);
    expect(act.shells).toBe(1);
  });

  it("noteUlwShell 非校验命令(如 ls) → 不 markVerifyReached,仅累计 shells", () => {
    const ctx = makeCtx(13);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship feature", "ulw");
    noteUlwShell(input0, ctx.cfg, "ls -la");
    const reloaded = loadRalph(input0, ctx.cfg)!;
    expect(reloaded.phaseReached.verify).toBe(false);
    expect(loadUlwActivity(input0, ctx.cfg).shells).toBe(1);
  });

  it("noteUlwRead → explore reached(经 processLoopStop advancePhase)", () => {
    const ctx = makeCtx(14);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship feature", "ulw");
    noteUlwRead(input0, ctx.cfg, "a.ts");
    processLoopStop(
      stopInput(ctx, "exploring"),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    const reloaded = loadRalph(input0, ctx.cfg)!;
    expect(reloaded.phaseReached.explore).toBe(true);
  });

  it("单次 processLoopStop advancePhase 完成 reads→explore + writes→verify", () => {
    const ctx = makeCtx(15);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship feature", "ulw");
    noteUlwRead(input0, ctx.cfg, "a.ts");
    noteUlwWrite(input0, ctx.cfg, "b.ts");
    const out = processLoopStop(
      stopInput(ctx, "implemented"),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.state.phaseReached.explore).toBe(true);
    expect(out.state.phaseReached.implement).toBe(true);
    expect(out.state.phase).toBe("verify");
  });

  it("resetUlwActivity 清零读写 shell 计数", () => {
    const ctx = makeCtx(16);
    const input0 = stopInput(ctx, "");
    noteUlwRead(input0, ctx.cfg, "a.ts");
    noteUlwWrite(input0, ctx.cfg, "b.ts");
    noteUlwShell(input0, ctx.cfg, "npm test");
    expect(loadUlwActivity(input0, ctx.cfg).reads).toBe(1);
    resetUlwActivity(input0, ctx.cfg);
    const act = loadUlwActivity(input0, ctx.cfg);
    expect(act.reads).toBe(0);
    expect(act.writes).toBe(0);
    expect(act.shells).toBe(0);
  });

  it("cancelRalph 清除状态文件 → loadRalph 返回 null", () => {
    const ctx = makeCtx(17);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship feature", "ulw");
    expect(loadRalph(input0, ctx.cfg)?.mode).toBe("ulw");
    cancelRalph(input0, ctx.cfg);
    expect(loadRalph(input0, ctx.cfg)).toBeNull();
  });
});

// ─── ULW opening ceremony (omo-style) ────────────────────────────────
describe("ulwCeremonyBanner (v1.1.27+ ritual)", () => {
  it("start banner requires ULTRAWORK MODE ENABLED opener", () => {
    const b = ulwCeremonyBanner("fix auth", "start");
    expect(b).toMatch(/ultrawork-mode/);
    expect(b).toMatch(/ULTRAWORK MODE ENABLED!/);
    expect(b).toMatch(/模式已启动/);
    expect(b).toMatch(/fix auth/);
    expect(b).toMatch(/FIRST|first|第一行/i);
  });

  it("start banner has ceremonial frame + ritual steps (v1.1.30)", () => {
    const b = ulwCeremonyBanner("ship oauth end-to-end", "start");
    // visual frame
    expect(b).toMatch(/═{8,}/);
    expect(b).toMatch(/开场仪式|OPENING RITUAL/i);
    // ordered ritual steps
    expect(b).toMatch(/1[.)、]/);
    expect(b).toMatch(/2[.)、]/);
    expect(b).toMatch(/3[.)、]/);
    // intensity / pledge
    expect(b).toMatch(/explore\s*→\s*implement\s*→\s*verify/i);
    expect(b).toMatch(/禁止|Do not|不得/i);
    expect(b).toMatch(/推巨石|boulder|maximum intensity|全力/i);
    expect(b).toMatch(/ship oauth end-to-end/);
  });

  it("start banner has oath + gong for 仪式感 (v1.1.49)", () => {
    const b = ulwCeremonyBanner("ritual task", "start");
    expect(b).toMatch(/誓词|OATH/i);
    expect(b).toMatch(/未 explore 不写|未 verify 不 DONE|未仪式不开工/i);
    expect(b).toMatch(/🔔|锣|gong|strike/i);
  });

  it("active banner keeps mode on without full re-bootstrap", () => {
    const b = ulwCeremonyBanner("keep going", "active");
    expect(b).toMatch(/STILL ON|active="true"|仍在运行/i);
    expect(b).toMatch(/keep going/);
    expect(b).toMatch(/═{8,}/);
  });

  it("upgrade banner notes Ralph → ULW promotion", () => {
    const b = ulwCeremonyBanner("finish remaining work", "upgrade");
    expect(b).toMatch(/ULTRAWORK MODE ENABLED!/);
    expect(b).toMatch(/Ralph|upgrade|升级/i);
    expect(b).toMatch(/开场仪式|OPENING RITUAL/i);
  });

  it("startRalph writes CEREMONY.md under .omg/ulw-loop", () => {
    const ctx = makeCtx(18);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship oauth", "ulw");
    const ceremony = path.join(ctx.ws, ".omg", "ulw-loop", "CEREMONY.md");
    expect(fs.existsSync(ceremony)).toBe(true);
    const body = fs.readFileSync(ceremony, "utf8");
    expect(body).toMatch(/ULTRAWORK MODE ENABLED/);
    expect(body).toMatch(/═{8,}/);
    expect(body).toMatch(/开场仪式|OPENING RITUAL/i);
  });

  it("cancelRalph removes CEREMONY.md (v1.1.28)", () => {
    const ctx = makeCtx(20);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship", "ulw");
    const ceremony = path.join(ctx.ws, ".omg", "ulw-loop", "CEREMONY.md");
    expect(fs.existsSync(ceremony)).toBe(true);
    cancelRalph(input0, ctx.cfg);
    expect(fs.existsSync(ceremony)).toBe(false);
  });

  it("UserPrompt ultrawork injects ceremony banner", () => {
    const ctx = makeCtx(19);
    const out = handleUserPrompt(
      {
        raw: {},
        event: "user-prompt",
        sessionId: ctx.sessionId,
        cwd: ctx.ws,
        workspaceRoot: ctx.ws,
        prompt: "ultrawork fix the login bug",
      },
      ctx.cfg,
    );
    const ctxText =
      "additionalContext" in out ? String(out.additionalContext || "") : "";
    expect(ctxText).toMatch(/ULTRAWORK MODE ENABLED!/);
    expect(ctxText).toMatch(/ultrawork-mode/);
    expect(ctxText).toMatch(/login|fix/i);
    expect(ctxText).toMatch(/开场仪式|OPENING RITUAL/i);
  });
});

// ─── ULW ceremony gate (v1.1.49) — skip opener → Stop yank ───────────
describe("ULW ceremony opener gate (v1.1.49)", () => {
  it("hasUlwCeremonyOpener: first non-empty line exact EN/ZH", () => {
    expect(hasUlwCeremonyOpener("ULTRAWORK MODE ENABLED!\nGoal: x")).toBe(true);
    expect(hasUlwCeremonyOpener("ULTRAWORK 模式已启动！\n目标: x")).toBe(true);
    expect(hasUlwCeremonyOpener("\n\nULTRAWORK MODE ENABLED!\nok")).toBe(true);
    expect(hasUlwCeremonyOpener("**ULTRAWORK MODE ENABLED!**\nGoal")).toBe(true);
    // v1.1.55: backticks / quotes / fullwidth brackets
    expect(hasUlwCeremonyOpener("`ULTRAWORK MODE ENABLED!`\nGoal")).toBe(true);
    expect(hasUlwCeremonyOpener('"ULTRAWORK MODE ENABLED!"\nGoal')).toBe(true);
    expect(hasUlwCeremonyOpener("【ULTRAWORK MODE ENABLED!】\nGoal")).toBe(true);
    expect(hasUlwCeremonyOpener("ok going\nULTRAWORK MODE ENABLED!")).toBe(false);
    expect(hasUlwCeremonyOpener("Looking into it.")).toBe(false);
    expect(hasUlwCeremonyOpener("")).toBe(false);
    expect(hasUlwCeremonyOpener(undefined)).toBe(false);
    // v1.1.59: emoji / markdown prefix · trailing punct
    expect(hasUlwCeremonyOpener("⚡ ULTRAWORK MODE ENABLED!")).toBe(true);
    expect(hasUlwCeremonyOpener("🔔 ULTRAWORK 模式已启动！")).toBe(true);
    expect(hasUlwCeremonyOpener("# ULTRAWORK MODE ENABLED!")).toBe(true);
    expect(hasUlwCeremonyOpener("> ULTRAWORK MODE ENABLED!")).toBe(true);
    expect(hasUlwCeremonyOpener("ULTRAWORK MODE ENABLED.")).toBe(true);
    expect(hasUlwCeremonyOpener("ULTRAWORK MODE ENABLED")).toBe(true);
    expect(hasUlwCeremonyOpener("启动 ULTRAWORK 模式已启动！")).toBe(false);
    // v1.1.60: bangs / arrow / numbered list prefix
    expect(hasUlwCeremonyOpener("!!! ULTRAWORK MODE ENABLED!")).toBe(true);
    expect(hasUlwCeremonyOpener("→ ULTRAWORK MODE ENABLED!")).toBe(true);
    expect(hasUlwCeremonyOpener("1. ULTRAWORK MODE ENABLED!")).toBe(true);
    // v1.1.61: rocket / 【开场】 / trailing emoji
    expect(hasUlwCeremonyOpener("🚀 ULTRAWORK MODE ENABLED!")).toBe(true);
    expect(hasUlwCeremonyOpener("【开场】ULTRAWORK MODE ENABLED!")).toBe(true);
    expect(hasUlwCeremonyOpener("ULTRAWORK MODE ENABLED! 🚀")).toBe(true);
    // v1.1.62: fire/sparkle · quotes · same-line Goal
    expect(hasUlwCeremonyOpener("🔥 ULTRAWORK MODE ENABLED!")).toBe(true);
    expect(hasUlwCeremonyOpener("✨ ULTRAWORK MODE ENABLED!")).toBe(true);
    expect(hasUlwCeremonyOpener("「ULTRAWORK MODE ENABLED!」")).toBe(true);
    expect(hasUlwCeremonyOpener("(ULTRAWORK MODE ENABLED!)")).toBe(true);
    expect(hasUlwCeremonyOpener("ULTRAWORK MODE ENABLED! Goal: x")).toBe(true);
    expect(hasUlwCeremonyOpener("ULTRAWORK MODE ENABLED! — begin")).toBe(true);
  });

  it("first ULW stop without opener → CEREMONY INCOMPLETE + loop stays active", () => {
    const ctx = makeCtx(30);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship oauth", "ulw");
    const out = processLoopStop(
      stopInput(ctx, "ok, looking into it."),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(true);
    expect(out.reason).toMatch(/开场仪式未完成|CEREMONY INCOMPLETE|OPENING RITUAL/i);
    expect(out.reason).toMatch(/ULTRAWORK MODE ENABLED!/);
    expect(loadRalph(input0, ctx.cfg)?.ceremonyOpened).toBe(false);
    expect(loadRalph(input0, ctx.cfg)?.active).toBe(true);
  });

  it("first ULW stop with EN opener marks ceremonyOpened and continues loop", () => {
    const ctx = makeCtx(31);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship oauth", "ulw");
    noteUlwRead(input0, ctx.cfg, "a.ts");
    const out = processLoopStop(
      stopInput(
        ctx,
        "ULTRAWORK MODE ENABLED!\nGoal: ship oauth\nReading auth module…",
      ),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(true);
    expect(out.reason).not.toMatch(/开场仪式未完成|CEREMONY INCOMPLETE/i);
    expect(loadRalph(input0, ctx.cfg)?.ceremonyOpened).toBe(true);
  });

  it("ZH opener also marks ceremonyOpened", () => {
    const ctx = makeCtx(32);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "修登录", "ulw");
    noteUlwRead(input0, ctx.cfg, "a.ts");
    const out = processLoopStop(
      stopInput(ctx, "ULTRAWORK 模式已启动！\n目标: 修登录\n开始 explore"),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(true);
    expect(loadRalph(input0, ctx.cfg)?.ceremonyOpened).toBe(true);
    expect(out.reason).not.toMatch(/CEREMONY INCOMPLETE|开场仪式未完成/i);
  });

  it("DONE without ceremony opener is rejected even with full evidence", () => {
    const ctx = makeCtx(33);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "ship feature", "ulw");
    noteUlwRead(input0, ctx.cfg, "a.ts");
    noteUlwWrite(input0, ctx.cfg, "b.ts");
    markVerified(input0, ctx.cfg);
    const out = processLoopStop(
      stopInput(ctx, "<promise>VERIFIED</promise>\n<promise>DONE</promise>"),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(true);
    expect(out.reason).toMatch(/开场仪式未完成|CEREMONY INCOMPLETE|OPENING RITUAL/i);
    expect(loadRalph(input0, ctx.cfg)?.active).toBe(true);
  });

  it("ulwCeremonyIncompleteReason is loud frame", () => {
    const r = ulwCeremonyIncompleteReason("fix login");
    expect(r).toMatch(/═{8,}/);
    expect(r).toMatch(/开场仪式未完成|CEREMONY INCOMPLETE/i);
    expect(r).toMatch(/ULTRAWORK MODE ENABLED!/);
    expect(r).toMatch(/fix login/);
  });

  it("ralph mode does not require ULW ceremony opener", () => {
    const ctx = makeCtx(34);
    const input0 = stopInput(ctx, "");
    startRalph(input0, ctx.cfg, "keep coding", "ralph");
    const out = processLoopStop(
      stopInput(ctx, "working on it"),
      ctx.cfg,
      loadRalph(input0, ctx.cfg)!,
    );
    expect(out.block).toBe(true);
    expect(out.reason).not.toMatch(/CEREMONY INCOMPLETE|开场仪式未完成/i);
  });
});

// ─── ULW ceremony PreTool hard gate (v1.1.58) ────────────────────────
describe("ULW ceremony PreTool hard gate (v1.1.58)", () => {
  function preInput(
    ctx: Ctx,
    over: Partial<HookInput> & { toolName: string },
  ): HookInput {
    return {
      raw: {},
      event: "pre-tool-use",
      sessionId: ctx.sessionId,
      cwd: ctx.ws,
      workspaceRoot: ctx.ws,
      toolInput: {},
      ...over,
    };
  }

  it("denies Write before ceremony opener", () => {
    const ctx = makeCtx(58);
    const base = stopInput(ctx, "");
    startRalph(base, ctx.cfg, "ship oauth", "ulw");
    const deny = ulwCeremonyPreDeny(
      preInput(ctx, {
        toolName: "Write",
        toolInput: { path: "a.ts", content: "x" },
      }),
      ctx.cfg,
    );
    expect(deny).toMatch(/开场仪式未完成|CEREMONY INCOMPLETE|OPENING RITUAL/i);
    expect(deny).toMatch(/PreTool|硬拦|写/);
  });

  it("denies mutating shell before ceremony", () => {
    const ctx = makeCtx(59);
    startRalph(stopInput(ctx, ""), ctx.cfg, "ship oauth", "ulw");
    const deny = ulwCeremonyPreDeny(
      preInput(ctx, {
        toolName: "Shell",
        toolInput: { command: "rm -rf dist" },
      }),
      ctx.cfg,
    );
    expect(deny).toMatch(/开场仪式未完成|CEREMONY INCOMPLETE/i);
  });

  it("allows Read and read-only shell before ceremony (explore path)", () => {
    const ctx = makeCtx(60);
    startRalph(stopInput(ctx, ""), ctx.cfg, "ship oauth", "ulw");
    expect(
      ulwCeremonyPreDeny(
        preInput(ctx, { toolName: "Read", toolInput: { path: "a.ts" } }),
        ctx.cfg,
      ),
    ).toBeNull();
    expect(
      ulwCeremonyPreDeny(
        preInput(ctx, {
          toolName: "Shell",
          toolInput: { command: "git status" },
        }),
        ctx.cfg,
      ),
    ).toBeNull();
  });

  it("opener in lastAssistantMessage opens ceremony and allows Write", () => {
    const ctx = makeCtx(61);
    startRalph(stopInput(ctx, ""), ctx.cfg, "ship oauth", "ulw");
    const deny = ulwCeremonyPreDeny(
      preInput(ctx, {
        toolName: "Write",
        toolInput: { path: "a.ts", content: "x" },
        lastAssistantMessage:
          "ULTRAWORK MODE ENABLED!\nGoal: ship oauth\nexploring…",
      }),
      ctx.cfg,
    );
    expect(deny).toBeNull();
    expect(loadRalph(stopInput(ctx, ""), ctx.cfg)?.ceremonyOpened).toBe(true);
  });

  it("handlePreToolUse host path denies Write without ceremony", () => {
    const ctx = makeCtx(62);
    startRalph(stopInput(ctx, ""), ctx.cfg, "ship oauth", "ulw");
    const r = handlePreToolUse(
      preInput(ctx, {
        toolName: "Write",
        toolInput: { path: "a.ts", content: "x" },
      }),
      ctx.cfg,
    );
    expect(r.output.decision).toBe("deny");
    expect(r.output.reason).toMatch(/开场仪式未完成|CEREMONY INCOMPLETE/i);
  });

  it("ralph mode Write is not blocked by ULW ceremony", () => {
    const ctx = makeCtx(63);
    startRalph(stopInput(ctx, ""), ctx.cfg, "keep going", "ralph");
    expect(
      ulwCeremonyPreDeny(
        preInput(ctx, {
          toolName: "Write",
          toolInput: { path: "a.ts", content: "x" },
        }),
        ctx.cfg,
      ),
    ).toBeNull();
  });

  it("banner / incomplete reason shout PreTool hard gate + ritual frame", () => {
    const start = ulwCeremonyBanner("fix login", "start");
    expect(start).toMatch(/鸣锣开场|STRIKE THE GONG/i);
    expect(start).toMatch(/开场仪式|OPENING RITUAL/i);
    expect(start).toMatch(/PreTool|硬门|硬拦/);
    expect(start).toMatch(/三步仪式|三步/);
    const active = ulwCeremonyBanner("fix login", "active");
    expect(active).toMatch(/仍在运行|STILL ON/i);
    expect(active).toMatch(/PreTool|硬拦|CEREMONY INCOMPLETE/i);
    const incomplete = ulwCeremonyIncompleteReason("fix login");
    expect(incomplete).toMatch(/PreTool|硬拦/);
    expect(incomplete).toMatch(/鸣锣/);
  });
});
