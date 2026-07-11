import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import { agentGuardBanner, resolveAgentRole } from "../features/agent-guard.js";
import { categoryBanner, detectCategory } from "../features/category.js";
import { diagUserContext } from "../features/diagnostics.js";
import { detectHandoff, handoffContext, writeHandoffStub } from "../features/handoff.js";
import { hashlineUserContext } from "../features/hashline.js";
import {
  detectInitDeep,
  initDeepContext,
  parseInitDeepOpts,
  runInitDeep,
} from "../features/init-deep.js";
import { detectIntent, intentBanner } from "../features/intent-gate.js";
import {
  commentCheckerHint,
  hardOrchestrationBanner,
} from "../features/orchestration.js";
import {
  detectPlanCommand,
  loadPlanMode,
  planModeContext,
  startPlanMode,
  startWorkFromPlan,
} from "../features/prometheus.js";
import {
  cancelRalph,
  detectRalphCommand,
  loadRalph,
  startRalph,
} from "../features/ralph.js";
import {
  loadInjectedRules,
  sisyphusBootstrap,
  usingSuperpowersHint,
} from "../features/rules.js";
import { saveLastPrompt, skillGateContext } from "../features/last-prompt.js";
import {
  detectAgentCommand,
  loadSessionAgentRoleState,
  setSessionAgentRole,
} from "../features/session-role.js";
import { detectThinkMode, thinkModeBanner } from "../features/think-mode.js";
import {
  loadSkillGateState,
  refreshCatalog,
  skillGateReminder,
} from "../features/skill-gate.js";
import {
  clearBoulder,
  isStopPaused,
  loadBoulder,
  setStopPaused,
} from "../features/todo-boulder.js";
import { readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";

function detectContinuation(prompt: string): "stop" | "resume" | null {
  if (/^\/stop-continuation\b/i.test(prompt.trim())) return "stop";
  if (/^\/resume-continuation\b/i.test(prompt.trim())) return "resume";
  return null;
}

function detectCancelBoulder(prompt: string): boolean {
  return /^\/cancel-boulder\b/i.test(prompt.trim());
}

export function handleUserPrompt(input: HookInput, cfg: EnvConfig): HookOutput {
  const parts: string[] = [];
  const prompt = input.prompt || "";
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);

  if (prompt) saveLastPrompt(input, cfg, prompt);

  const countState = readJson<{ n: number }>(p.promptCount, { n: 0 });
  const isFirst = countState.n === 0 || input.isFirstPrompt;
  countState.n += 1;
  writeJsonAtomic(p.promptCount, countState);

  const cont = detectContinuation(prompt);
  if (cont === "stop") {
    setStopPaused(input, cfg, true);
    parts.push(
      "<OMG_CTRL>Auto-continuation PAUSED (/stop-continuation). /resume-continuation to resume.</OMG_CTRL>",
    );
  } else if (cont === "resume") {
    setStopPaused(input, cfg, false);
    parts.push("<OMG_CTRL>Auto-continuation RESUMED.</OMG_CTRL>");
  }

  if (detectCancelBoulder(prompt)) {
    clearBoulder(input, cfg);
    parts.push("<OMG_CTRL>Boulder cleared (/cancel-boulder).</OMG_CTRL>");
  }

  const agentCmd = detectAgentCommand(prompt);
  if (agentCmd) {
    // Explicit /agent wins over host agentName (same prompt + rest of session)
    setSessionAgentRole(input, cfg, agentCmd.role, "slash-agent");
    parts.push(
      `<OMG_CTRL>Session agent role set to **${agentCmd.role}** (/agent). Agent Guard applies sticky role.</OMG_CTRL>`,
    );
  } else if (input.agentName) {
    // Never clobber an active slash-agent sticky with host tags on later turns
    // (subagent sessions often re-send agentName=oracle every UserPrompt).
    const sticky = loadSessionAgentRoleState(input, cfg);
    if (sticky?.source === "slash-agent" && sticky.role) {
      // keep slash override; surface reminder
      parts.push(
        `<OMG_CTRL>Keeping slash sticky role **${sticky.role}** (host agentName ignored until /agent changes it).</OMG_CTRL>`,
      );
    } else {
      const hostRole = String(input.agentName).trim().toLowerCase();
      if (hostRole) {
        setSessionAgentRole(input, cfg, hostRole, "host-agentName");
      }
    }
  }

  const ralphCmd = detectRalphCommand(prompt);
  const existingLoop = loadRalph(input, cfg);
  if (ralphCmd.action === "cancel") {
    cancelRalph(input, cfg);
    parts.push("<OMG_CTRL>Ralph/ULW loop cancelled.</OMG_CTRL>");
  } else if (ralphCmd.action === "start-ralph") {
    // slash always (re)starts; avoid clobbering active loop on accidental keyword
    startRalph(input, cfg, ralphCmd.task, "ralph");
    parts.push(`<OMG_CTRL>Ralph loop started: ${ralphCmd.task}</OMG_CTRL>`);
  } else if (ralphCmd.action === "start-ulw") {
    const isSlash = /^\/(ulw|ulw-loop|ultrawork)\b/i.test(prompt.trim());
    if (isSlash || !existingLoop) {
      startRalph(input, cfg, ralphCmd.task, "ulw");
      parts.push(`<OMG_CTRL>ULW/ultrawork loop started: ${ralphCmd.task}</OMG_CTRL>`);
    } else if (existingLoop.mode === "ulw") {
      parts.push(
        `<OMG_CTRL>ULW already active (phase=${existingLoop.phase}). Task: ${existingLoop.task}</OMG_CTRL>`,
      );
    } else {
      startRalph(input, cfg, ralphCmd.task, "ulw");
      parts.push(`<OMG_CTRL>ULW/ultrawork loop started (upgraded from ralph): ${ralphCmd.task}</OMG_CTRL>`);
    }
  }

  const planCmd = detectPlanCommand(prompt);
  if (planCmd.action === "plan") {
    const pm = startPlanMode(input, cfg, planCmd.topic);
    parts.push(planModeContext(pm));
  } else if (planCmd.action === "start-work") {
    const planPath = startWorkFromPlan(input, cfg);
    parts.push(
      `<OMG_CTRL>start-work: boulder active for plan ${planPath}. Execute as Atlas/Sisyphus.</OMG_CTRL>`,
    );
  }

  if (detectHandoff(prompt)) {
    const file = writeHandoffStub(input, cfg, prompt);
    parts.push(handoffContext(file));
  }

  if (detectInitDeep(prompt)) {
    const opts = parseInitDeepOpts(prompt);
    const result = runInitDeep(input.workspaceRoot, opts);
    parts.push(initDeepContext(result));
  }

  if (isFirst) {
    parts.push(sisyphusBootstrap());
    parts.push(usingSuperpowersHint(cfg.pluginRoot));
    parts.push("[oh-my-grok:alive] hooks online — fingerprint + harness v0.2.");
  }

  if (cfg.hardOrchestration) {
    parts.push(hardOrchestrationBanner());
    parts.push(commentCheckerHint());
  }

  let gate = loadSkillGateState(input, cfg);
  if (!gate.catalog.length) gate = refreshCatalog(input, cfg);
  parts.push(skillGateReminder(gate, skillGateContext(input, cfg)));

  parts.push(loadInjectedRules(input.workspaceRoot, cfg));

  const ralph = loadRalph(input, cfg);
  if (ralph) {
    parts.push(
      [
        `<OMG_RALPH active="true" mode="${ralph.mode}" iter="${ralph.iteration}/${ralph.maxIterations}" phase="${ralph.phase}">`,
        `Task: ${ralph.task}`,
        ralph.mode === "ulw"
          ? `ULW phases: explore=${ralph.phaseReached.explore} implement=${ralph.phaseReached.implement} verify=${ralph.phaseReached.verify} stall=${ralph.stallCount}`
          : "",
        ralph.mode === "ulw"
          ? "Logs: .omg/ulw-loop/log/ — DONE needs VERIFIED + explore/implement evidence."
          : "",
        `</OMG_RALPH>`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (cfg.intentGate && prompt) {
    parts.push(intentBanner(detectIntent(prompt)));
  }

  if (prompt && detectThinkMode(prompt)) {
    parts.push(thinkModeBanner(true));
  }

  if (prompt && !detectInitDeep(prompt)) {
    const cat = detectCategory(prompt);
    if (cat) parts.push(categoryBanner(cat));
  }

  const agentRole = resolveAgentRole(input, cfg);
  if (agentRole) {
    const ag = agentGuardBanner(agentRole);
    if (ag) parts.push(ag);
  }

  const pm = loadPlanMode(input, cfg);
  if (pm.active && planCmd.action !== "plan") parts.push(planModeContext(pm));

  const boulder = loadBoulder(input, cfg);
  if (boulder) {
    parts.push(
      `<OMG_BOULDER active="true" title="${boulder.title || ""}" plan="${boulder.planPath || ""}" />`,
    );
  }

  parts.push(hashlineUserContext(input, cfg));
  parts.push(diagUserContext(input, cfg));

  if (isStopPaused(input, cfg)) {
    parts.push("<OMG_CTRL>Note: auto-continuation is currently paused.</OMG_CTRL>");
  }

  const additionalContext = parts.filter(Boolean).join("\n\n");
  return { additionalContext };
}
