import { planModeDeny } from "../features/prometheus.js";
import { isMutatingTool, loadSkillGateState, refreshCatalog, skillGateDenyReason, } from "../features/skill-gate.js";
export function handlePreToolUse(input, cfg) {
    if (!isMutatingTool(input.toolName)) {
        return { output: { decision: "allow" }, exitCode: 0 };
    }
    // Prometheus plan-mode first
    const planDeny = planModeDeny(input, cfg);
    if (planDeny) {
        return { output: { decision: "deny", reason: planDeny }, exitCode: 2 };
    }
    if (!cfg.skillGate) {
        return { output: { decision: "allow" }, exitCode: 0 };
    }
    let state = loadSkillGateState(input, cfg);
    if (!state.catalog.length)
        state = refreshCatalog(input, cfg);
    const reason = skillGateDenyReason(state);
    if (reason) {
        return { output: { decision: "deny", reason }, exitCode: 2 };
    }
    return { output: { decision: "allow" }, exitCode: 0 };
}
//# sourceMappingURL=pre-tool-use.js.map