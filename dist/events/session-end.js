import { writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
export function handleSessionEnd(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    writeJsonAtomic(p.promptCount, { n: 0 });
    // leave ralph/boulder for cross-session; only clear ephemeral pause if desired
    return {};
}
//# sourceMappingURL=session-end.js.map