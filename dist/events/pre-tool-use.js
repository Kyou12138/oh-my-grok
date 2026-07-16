import { agentGuardDeny } from "../features/agent-guard.js";
import { categoryDisciplinePreDeny } from "../features/category-discipline.js";
import { commentCheckerPreDeny } from "../features/comment-checker.js";
import { hashlinePreToolDeny } from "../features/hashline.js";
import { planModeDeny } from "../features/prometheus.js";
import { skillGateContext } from "../features/last-prompt.js";
import { isMutatingTool, loadSkillGateState, refreshCatalog, skillGateDenyReason, } from "../features/skill-gate.js";
export function handlePreToolUse(input, cfg) {
    // 0) Agent role guard (even before mutating-tool short-circuit helpers)
    const agentDeny = agentGuardDeny(input, cfg);
    if (agentDeny) {
        return { output: { decision: "deny", reason: agentDeny }, exitCode: 2 };
    }
    if (!isMutatingTool(input.toolName)) {
        return { output: { decision: "allow" }, exitCode: 0 };
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
    // 4) Skill gate (intent-aware when last prompt/task matches known skills)
    if (cfg.skillGate) {
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