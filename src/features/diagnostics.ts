import { spawnSync } from "node:child_process";
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { ensureDir, readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";

export interface DiagState {
  schemaVersion: 1;
  needsVerify: boolean;
  lastErrors: string;
  lastRunAt: number;
  lastFiles: string[];
  verifiedAt: number;
  /** Soft mode (no diagCommand): only one Stop block per dirty cycle */
  softPrompted: boolean;
}

function diagPath(input: HookInput, cfg: EnvConfig): string {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.session);
  return path.join(p.session, "diagnostics.json");
}

export function loadDiag(input: HookInput, cfg: EnvConfig): DiagState {
  return readJson<DiagState>(diagPath(input, cfg), {
    schemaVersion: 1,
    needsVerify: false,
    lastErrors: "",
    lastRunAt: 0,
    lastFiles: [],
    verifiedAt: 0,
    softPrompted: false,
  });
}

export function saveDiag(input: HookInput, cfg: EnvConfig, st: DiagState): void {
  writeJsonAtomic(diagPath(input, cfg), st);
}

export function markDirty(input: HookInput, cfg: EnvConfig, file?: string): void {
  if (!cfg.diagEnforce) return;
  const st = loadDiag(input, cfg);
  st.needsVerify = true;
  st.softPrompted = false;
  if (file) {
    st.lastFiles = [...new Set([file, ...st.lastFiles])].slice(0, 20);
  }
  saveDiag(input, cfg, st);
}

export function markVerified(input: HookInput, cfg: EnvConfig): void {
  const st = loadDiag(input, cfg);
  st.needsVerify = false;
  st.lastErrors = "";
  st.softPrompted = false;
  st.verifiedAt = Date.now();
  saveDiag(input, cfg, st);
}

export function markSoftPrompted(input: HookInput, cfg: EnvConfig): void {
  const st = loadDiag(input, cfg);
  st.softPrompted = true;
  saveDiag(input, cfg, st);
}

export function runDiagCommand(input: HookInput, cfg: EnvConfig): DiagState {
  const st = loadDiag(input, cfg);
  if (!cfg.diagCommand) {
    st.lastRunAt = Date.now();
    saveDiag(input, cfg, st);
    return st;
  }
  try {
    const r = spawnSync(cfg.diagCommand, {
      cwd: input.workspaceRoot || input.cwd,
      shell: true,
      encoding: "utf8",
      timeout: cfg.diagTimeoutMs,
      env: process.env,
    });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
    st.lastRunAt = Date.now();
    if (r.status === 0) {
      st.needsVerify = false;
      st.lastErrors = "";
      st.verifiedAt = Date.now();
    } else {
      st.needsVerify = true;
      st.lastErrors = out.slice(0, 4000) || `diag exit ${r.status}`;
    }
  } catch (e) {
    st.needsVerify = true;
    st.lastErrors = String(e).slice(0, 1000);
    st.lastRunAt = Date.now();
  }
  saveDiag(input, cfg, st);
  return st;
}

export function isVerifiedMessage(msg?: string): boolean {
  if (!msg) return false;
  if (/<promise>VERIFIED<\/promise>/i.test(msg)) return true;
  if (/\bOMG_VERIFIED\b/.test(msg)) return true;
  // diagnostics clean — reject obvious negation
  if (
    /diagnostics clean/i.test(msg) &&
    !/\b(?:not|never|aren't|isn't)\b[^.!\n]{0,40}diagnostics\s+clean|diagnostics\s+(?:not|aren't)\s+clean/i.test(
      msg,
    )
  ) {
    return true;
  }
  // "all tests passed" 仅当前面无紧邻否定语境时算验证,堵住 verify-gate 误放行。
  // v0.13 起 'not all tests passed';v0.14 补全缩写(don't/isn't/aren't/wasn't/...)
  // 与频度否定(rarely/hardly/barely/scarcely/seldom)——v0.13 黑名单列窄漏网。
  // 不含 'no':会误拒合法 'no issue, all tests passed'。
  // v1.1.14: 尾随 except/but/failed 与 almost/mostly 前缀；中文「全部测试通过」。
  const NEGATED_ALL_TESTS =
    /\b(?:not|never|without|rarely|seldom|hardly|barely|scarcely|don'?t|doesn'?t|isn'?t|aren'?t|wasn'?t|weren'?t|won'?t|wouldn'?t|shouldn'?t|couldn'?t|mustn'?t|haven'?t|hasn'?t|hadn'?t|ain'?t|didn'?t)\b[^.!\n]*\ball tests passed\b/i;
  const HEDGED_AFTER =
    /\ball tests passed\b[^.!\n]{0,80}\b(except|but|however|failing|failed|error|errors|broken|still\s+fail)/i;
  const HEDGED_BEFORE =
    /\b(almost|nearly|mostly|partially|roughly)\b[^.!\n]{0,40}\ball tests passed\b/i;
  if (/\ball tests passed\b/i.test(msg)) {
    if (NEGATED_ALL_TESTS.test(msg) || HEDGED_AFTER.test(msg) || HEDGED_BEFORE.test(msg)) {
      return false;
    }
    return true;
  }
  // Chinese explicit pass (not partial/failed)
  if (
    /(?:全部|所有)测试(?:均)?(?:已)?通过|测试(?:全部|均)(?:已)?通过/.test(msg) &&
    !/(?:未|没有|没|并非|不)(?:全部|所有)?测试|测试(?:未|不|失败)|仍有失败|还有失败/.test(msg)
  ) {
    return true;
  }
  return false;
}

/**
 * PreTool deny when last diagCommand run failed (host-enforced).
 * Soft needsVerify (no lastErrors) stays Stop-only — do not block all edits.
 */
export function diagPreDeny(input: HookInput, cfg: EnvConfig): string | null {
  if (!cfg.diagEnforce) return null;
  const st = loadDiag(input, cfg);
  if (!st.lastErrors?.trim()) return null;
  return [
    "[DIAGNOSTICS] Last diagnostic run failed — fix before more edits.",
    st.lastFiles.length ? `Recent files: ${st.lastFiles.slice(0, 5).join(", ")}` : "",
    "```",
    st.lastErrors.slice(0, 2000),
    "```",
    cfg.diagCommand
      ? `How to fix: run \`${cfg.diagCommand}\`, repair failures, then retry (post-write re-runs diag).`
      : "How to fix: run tests/typecheck, repair failures, then retry.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function diagStopReason(input: HookInput, cfg: EnvConfig): string | null {
  if (!cfg.diagEnforce) return null;
  const st = loadDiag(input, cfg);
  if (st.lastErrors) {
    return [
      "DIAGNOSTICS BLOCK — fix errors before stopping.",
      st.lastFiles.length ? `Recent files: ${st.lastFiles.slice(0, 5).join(", ")}` : "",
      "```",
      st.lastErrors.slice(0, 2500),
      "```",
      cfg.diagCommand
        ? `Re-run: ${cfg.diagCommand}`
        : "Run your test/typecheck, fix issues, then continue.",
      "When clean, say diagnostics clean or output <promise>VERIFIED</promise>.",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (st.needsVerify && !isVerifiedMessage(input.lastAssistantMessage)) {
    if (!cfg.diagCommand && !st.softPrompted) {
      return [
        "VERIFY BEFORE STOP — you edited files this session (one reminder).",
        "Run tests/typecheck/lint as appropriate for the project.",
        "If green, output <promise>VERIFIED</promise> or say diagnostics clean.",
        "Tip: set .omg/config.json { \"diagCommand\": \"npm test\" } for auto checks.",
        st.lastFiles.length ? `Touched: ${st.lastFiles.slice(0, 8).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (cfg.diagCommand && !st.lastErrors) {
      // command not run yet after dirty — try reason to re-run via post-write
      return null;
    }
  }
  return null;
}

export function diagUserContext(input: HookInput, cfg: EnvConfig): string {
  if (!cfg.diagEnforce) return "";
  const st = loadDiag(input, cfg);
  if (!st.needsVerify && !st.lastErrors) return "";
  return [
    "<OMG_DIAGNOSTICS>",
    st.needsVerify ? "needsVerify=true — do not claim done without verification." : "",
    st.lastErrors ? `lastErrors:\n${st.lastErrors.slice(0, 1500)}` : "",
    cfg.diagCommand ? `diagCommand=${cfg.diagCommand}` : "No diagCommand configured.",
    "</OMG_DIAGNOSTICS>",
  ]
    .filter(Boolean)
    .join("\n");
}
