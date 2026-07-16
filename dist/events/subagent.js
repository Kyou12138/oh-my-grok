import { markSpawnActivity } from "../features/category-discipline.js";
import { markSpawnFollowThrough, markSubagentChildFinished, } from "../features/spawn-followthrough.js";
function roleOf(input) {
    return (input.subagentType ||
        String(input.raw?.subagentType ?? input.raw?.subagent_type ?? "").trim() ||
        "");
}
/** Host SubagentStart — arm follow-through + category spawn mark (parent session). */
export function handleSubagentStart(input, cfg) {
    markSpawnActivity(input, cfg);
    const role = roleOf(input);
    markSpawnFollowThrough(input, cfg, role || undefined);
    return {};
}
/**
 * Host SubagentEnd — child process finished.
 * Keep follow-through pending so parent still recovers/integrates (v1.1.3).
 */
export function handleSubagentEnd(input, cfg) {
    markSubagentChildFinished(input, cfg, roleOf(input) || undefined);
    return {};
}
//# sourceMappingURL=subagent.js.map