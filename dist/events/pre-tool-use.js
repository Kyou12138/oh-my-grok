import { agentGuardDeny } from "../features/agent-guard.js";
import { categoryDisciplinePreDeny } from "../features/category-discipline.js";
import { commentCheckerPreDeny } from "../features/comment-checker.js";
import { diagPreDeny } from "../features/diagnostics.js";
import { hashlinePreToolDeny } from "../features/hashline.js";
import { isPlanModePlanOnlyWrite, planModeDeny, prometheusRoleDeny, } from "../features/prometheus.js";
import { resolveAgentRole } from "../features/agent-guard.js";
import { skillGateContext } from "../features/last-prompt.js";
import { isMutatingTool, loadSkillGateState, refreshCatalog, skillGateDenyReason, } from "../features/skill-gate.js";
import { spawnFollowThroughPreDeny } from "../features/spawn-followthrough.js";
import { workspaceBoundaryDeny } from "../features/workspace-boundary.js";
export function handlePreToolUse(input, cfg) {
    // 0) Agent role guard (even before mutating-tool short-circuit helpers)
    const agentDeny = agentGuardDeny(input, cfg);
    if (agentDeny) {
        return { output: { decision: "deny", reason: agentDeny }, exitCode: 2 };
    }
    if (!isMutatingTool(input.toolName)) {
        return { output: { decision: "allow" }, exitCode: 0 };
    }
    // 0.5) Prometheus sticky role — plan paths only (v1.1.26)
    const roleDeny = prometheusRoleDeny(input, cfg, resolveAgentRole(input, cfg));
    if (roleDeny) {
        return { output: { decision: "deny", reason: roleDeny }, exitCode: 2 };
    }
    // 0.6) Workspace boundary — no ../ or foreign abs paths (v1.1.32, hard)
    const wsDeny = workspaceBoundaryDeny(input);
    if (wsDeny) {
        return { output: { decision: "deny", reason: wsDeny }, exitCode: 2 };
    }
    // 1) Prometheus plan-mode
    const planDeny = planModeDeny(input, cfg);
    if (planDeny) {
        return { output: { decision: "deny", reason: planDeny }, exitCode: 2 };
    }
    // 1.5) Category discipline — specialist work + zero spawns (once; host-enforced)
    const catDisc = categoryDisciplinePreDeny(input, cfg);
    if (catDisc) {
        return { output: { decision: "deny", reason: catDisc }, exitCode: 2 };
    }
    // 1.6) Spawn follow-through — child finished + still pending (once; host-enforced)
    const spawnFt = spawnFollowThroughPreDeny(input, cfg);
    if (spawnFt) {
        return { output: { decision: "deny", reason: spawnFt }, exitCode: 2 };
    }
    // 1.7) Diagnostics hard fail — lastErrors set (host-enforced until clean)
    const diagDeny = diagPreDeny(input, cfg);
    if (diagDeny) {
        return { output: { decision: "deny", reason: diagDeny }, exitCode: 2 };
    }
    // 2) Hashline stale-edit guard (+ write-before-read)
    const hl = hashlinePreToolDeny(input, cfg);
    if (hl) {
        return { output: { decision: "deny", reason: hl }, exitCode: 2 };
    }
    // 3) Comment checker hard deny
    const cc = commentCheckerPreDeny(input, cfg);
    if (cc) {
        return { output: { decision: "deny", reason: cc }, exitCode: 2 };
    }
    // 4) Skill gate — skip pure .omg/plans writes while plan-mode active (v1.1.26)
    //    so /plan drafting is not blocked by unrelated TDD/design intent keywords
    if (cfg.skillGate && !isPlanModePlanOnlyWrite(input, cfg)) {
        let state = loadSkillGateState(input, cfg);
        if (!state.catalog.length)
            state = refreshCatalog(input, cfg);
        const ctx = skillGateContext(input, cfg);
        const reason = skillGateDenyReason(state, ctx);
        if (reason) {
            return { output: { decision: "deny", reason }, exitCode: 2 };
        }
    }
    return { output: { decision: "allow" }, exitCode: 0 };
}
//# sourceMappingURL=pre-tool-use.js.map