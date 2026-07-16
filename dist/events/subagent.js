import { markSpawnActivity } from "../features/category-discipline.js";
import { clearSpawnFollowThrough, markSpawnFollowThrough, } from "../features/spawn-followthrough.js";
import { setSessionAgentRole } from "../features/session-role.js";
function roleOf(input) {
    return (input.subagentType ||
        input.agentName ||
        String(input.raw?.subagentType ?? input.raw?.subagent_type ?? "").trim() ||
        "");
}
/** Host SubagentStart — arm follow-through + category spawn mark + sticky role. */
export function handleSubagentStart(input, cfg) {
    markSpawnActivity(input, cfg);
    const role = roleOf(input);
    markSpawnFollowThrough(input, cfg, role || undefined);
    if (role) {
        setSessionAgentRole(input, cfg, role, "subagent-start");
    }
    return {};
}
/** Host SubagentEnd (alias of SubagentStop in runner) — result recovered. */
export function handleSubagentEnd(input, cfg) {
    clearSpawnFollowThrough(input, cfg);
    return {};
}
//# sourceMappingURL=subagent.js.map