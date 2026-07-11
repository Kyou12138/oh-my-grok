import type { EnvConfig, HookInput, HookOutput } from "../protocol/types.js";
import { detectHandoff, handoffContext, writeHandoffStub } from "../features/handoff.js";
import { detectIntent, intentBanner } from "../features/intent-gate.js";
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
import {
  loadSkillGateState,
  refreshCatalog,
  skillGateReminder,
} from "../features/skill-gate.js";
import { isStopPaused, loadBoulder, setStopPaused } from "../features/todo-boulder.js";
import { readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";

function detectContinuation(prompt: string): "stop" | "resume" | null {
  if (/^\/stop-continuation\b/i.test(prompt.trim())) return "stop";
  if (/^\/resume-continuation\b/i.test(prompt.trim())) return "resume";
  return null;
}

export function handleUserPrompt(input: HookInput, cfg: EnvConfig): HookOutput {
  const parts: string[] = [];
  const prompt = input.prompt || "";
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);

  const countState = readJson<{ n: number }>(p.promptCount, { n: 0 });
  const isFirst = countState.n === 0 || input.isFirstPrompt;
  countState.n += 1;
  writeJsonAtomic(p.promptCount, countState);

  // Slash: continuation
  const cont = detectContinuation(prompt);
  if (cont === "stop") {
    setStopPaused(input, cfg, true);
    parts.push("<OMG_CTRL>Auto-continuation PAUSED (/stop-continuation). /resume-continuation to resume.</OMG_CTRL>");
  } else if (cont === "resume") {
    setStopPaused(input, cfg, false);
    parts.push("<OMG_CTRL>Auto-continuation RESUMED.</OMG_CTRL>");
  }

  // Slash: ralph / ulw
  const ralphCmd = detectRalphCommand(prompt);
  if (ralphCmd.action === "cancel") {
    cancelRalph(input, cfg);
    parts.push("<OMG_CTRL>Ralph/ULW loop cancelled.</OMG_CTRL>");
  } else if (ralphCmd.action === "start-ralph") {
    startRalph(input, cfg, ralphCmd.task, "ralph");
    parts.push(`<OMG_CTRL>Ralph loop started: ${ralphCmd.task}</OMG_CTRL>`);
  } else if (ralphCmd.action === "start-ulw") {
    startRalph(input, cfg, ralphCmd.task, "ulw");
    parts.push(`<OMG_CTRL>ULW/ultrawork loop started: ${ralphCmd.task}</OMG_CTRL>`);
  }

  // Slash: plan / start-work
  const planCmd = detectPlanCommand(prompt);
  if (planCmd.action === "plan") {
    const pm = startPlanMode(input, cfg, planCmd.topic);
    parts.push(planModeContext(pm));
  } else if (planCmd.action === "start-work") {
    const planPath = startWorkFromPlan(input, cfg);
    parts.push(`<OMG_CTRL>start-work: boulder active for plan ${planPath}. Execute as Atlas/Sisyphus.</OMG_CTRL>`);
  }

  // Slash: handoff
  if (detectHandoff(prompt)) {
    const file = writeHandoffStub(input, cfg, prompt);
    parts.push(handoffContext(file));
  }

  // First prompt: sisyphus + superpowers
  if (isFirst) {
    parts.push(sisyphusBootstrap());
    parts.push(usingSuperpowersHint(cfg.pluginRoot));
    parts.push("[oh-my-grok:alive] hooks online — fingerprint session-start + this banner.");
  }

  // Skill gate
  let gate = loadSkillGateState(input, cfg);
  if (!gate.catalog.length) gate = refreshCatalog(input, cfg);
  parts.push(skillGateReminder(gate));

  // Rules
  parts.push(loadInjectedRules(input.workspaceRoot, cfg));

  // Active ralph context
  const ralph = loadRalph(input, cfg);
  if (ralph) {
    parts.push(
      `<OMG_RALPH active="${ralph.mode}" iter="${ralph.iteration}/${ralph.maxIterations}">Task: ${ralph.task}</OMG_RALPH>`,
    );
  }

  // Intent
  if (cfg.intentGate && prompt) {
    parts.push(intentBanner(detectIntent(prompt)));
  }

  // Plan mode residual
  const pm = loadPlanMode(input, cfg);
  if (pm.active && planCmd.action !== "plan") parts.push(planModeContext(pm));

  // Boulder
  const boulder = loadBoulder(input, cfg);
  if (boulder) {
    parts.push(
      `<OMG_BOULDER active="true" title="${boulder.title || ""}" plan="${boulder.planPath || ""}" />`,
    );
  }

  if (isStopPaused(input, cfg)) {
    parts.push("<OMG_CTRL>Note: auto-continuation is currently paused.</OMG_CTRL>");
  }

  const additionalContext = parts.filter(Boolean).join("\n\n");
  return { additionalContext };
}
