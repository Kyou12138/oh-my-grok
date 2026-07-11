import { hashlinePreToolDeny } from "../features/hashline.js";
import { planModeDeny } from "../features/prometheus.js";
import { isMutatingTool, loadSkillGateState, refreshCatalog, skillGateDenyReason, } from "../features/skill-gate.js";
export function handlePreToolUse(input, cfg) {
    if (!isMutatingTool(input.toolName)) {
        return { output: { decision: "allow" }, exitCode: 0 };
    }
    // 1) Prometheus plan-mode
    const planDeny = planModeDeny(input, cfg);
    if (planDeny) {
        return { output: { decision: "deny", reason: planDeny }, exitCode: 2 };
    }
    // 2) Hashline stale-edit guard
    const hl = hashlinePreToolDeny(input, cfg);
    if (hl) {
        return { output: { decision: "deny", reason: hl }, exitCode: 2 };
    }
    // 3) Skill gate
    if (cfg.skillGate) {
        let state = loadSkillGateState(input, cfg);
        if (!state.catalog.length)
            state = refreshCatalog(input, cfg);
        const reason = skillGateDenyReason(state);
        if (reason) {
            return { output: { decision: "deny", reason }, exitCode: 2 };
        }
    }
    return { output: { decision: "allow" }, exitCode: 0 };
}
//# sourceMappingURL=pre-tool-use.js.map