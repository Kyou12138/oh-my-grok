import { readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { detectCategory } from "./category.js";
import { loadLastPrompt } from "./last-prompt.js";
const SPECIALIST = {
    "visual-engineering": "spawn **explore** to map current UI/state, then **hephaestus** for goal-oriented implementation; verify via browser/screenshot pass",
    ultrabrain: "spawn **oracle** (read-only) for architecture consult before coding — evidence over vibes",
    deep: "spawn **hephaestus** for goal-oriented multi-file work — one goal + one deliverable per pass",
};
function fileFor(input, cfg) {
    return pathsFor(input.workspaceRoot, input.sessionId, cfg).categoryDiscipline;
}
function load(input, cfg) {
    return readJson(fileFor(input, cfg), {
        schemaVersion: 1,
        spawnCount: 0,
        prompted: false,
    });
}
/** Called from post-tool spawn handler — bump spawn activity, clear prompted. */
export function markSpawnActivity(input, cfg) {
    const st = load(input, cfg);
    st.spawnCount = (st.spawnCount || 0) + 1;
    st.prompted = false;
    writeJsonAtomic(fileFor(input, cfg), st);
}
/** Stop gate: specialist work + zero spawns => block once per session. */
export function categoryDisciplineStopReason(input, cfg) {
    if (!cfg.categoryDiscipline)
        return null;
    const prompt = loadLastPrompt(input, cfg);
    if (!prompt)
        return null;
    const cat = detectCategory(prompt);
    if (!cat)
        return null;
    const advice = SPECIALIST[cat];
    if (!advice)
        return null;
    const st = load(input, cfg);
    if ((st.spawnCount || 0) > 0)
        return null;
    if (st.prompted)
        return null;
    writeJsonAtomic(fileFor(input, cfg), { ...st, prompted: true });
    return [
        "<OMG_CATEGORY_DISCIPLINE>",
        "Work category **" + cat + "** detected but this session has spawned **0 subagents**.",
        "Recommended (reduce blind edits):",
        "- " + advice,
        "",
        "Or proceed without spawning if truly unnecessary — this prompt appears at most once per session.",
        "</OMG_CATEGORY_DISCIPLINE>",
    ].join("\n");
}
//# sourceMappingURL=category-discipline.js.map