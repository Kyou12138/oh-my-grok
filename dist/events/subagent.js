import { markSpawnActivity } from "../features/category-discipline.js";
import { clearSpawnFollowThrough, markSpawnFollowThrough, } from "../features/spawn-followthrough.js";
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
/** Host SubagentEnd — result recovered; clear follow-through. */
export function handleSubagentEnd(input, cfg) {
    clearSpawnFollowThrough(input, cfg);
    return {};
}
//# sourceMappingURL=subagent.js.map