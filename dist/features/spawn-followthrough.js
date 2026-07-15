/**
 * Spawn follow-through / result recovery (v0.21, deepened v1.0).
 * After subagent spawn: Stop blocks when parent is idle or only announces spawn.
 * Up to MAX_YANKS per wave; re-arms on each new spawn.
 */
import path from "node:path";
import { readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { isIdleAssistantMessage } from "./idle-turn.js";
export const SPAWN_FOLLOWTHROUGH_MAX_YANKS = 2;
function fileFor(input, cfg) {
    return path.join(pathsFor(input.workspaceRoot, input.sessionId, cfg).session, "spawn-followthrough.json");
}
function load(input, cfg) {
    const raw = readJson(fileFor(input, cfg), {
        schemaVersion: 2,
        pending: false,
        yankCount: 0,
        updatedAt: "",
    });
    // migrate v1 → v2
    return {
        schemaVersion: 2,
        pending: !!raw.pending,
        lastRole: raw.lastRole,
        yankCount: typeof raw.yankCount === "number" ? raw.yankCount : 0,
        updatedAt: raw.updatedAt || "",
    };
}
function save(input, cfg, st) {
    writeJsonAtomic(fileFor(input, cfg), {
        ...st,
        schemaVersion: 2,
        updatedAt: new Date().toISOString(),
    });
}
/** PostTool spawn — arm / re-arm follow-through for result recovery. */
export function markSpawnFollowThrough(input, cfg, role) {
    save(input, cfg, {
        schemaVersion: 2,
        pending: true,
        lastRole: role || undefined,
        yankCount: 0,
        updatedAt: new Date().toISOString(),
    });
}
/**
 * "I spawned explore" / "dispatched hephaestus" without concrete results.
 * Long messages with evidence keywords are NOT spawn-announce.
 */
export function isSpawnAnnounceMessage(msg) {
    if (!msg)
        return false;
    const t = msg.trim();
    if (!t || t.length > 280)
        return false;
    if (/\b(found|fixed|edited|implemented|verified|passed|failing|diff|VERDICT|GOAL_DONE|integrated|get_task_output)\b/i.test(t)) {
        return false;
    }
    return (/\b(spawned|dispatched|launched|delegated)\b/i.test(t) ||
        /\bspawn_subagent\b/i.test(t) ||
        /派出|委派|已 spawn|子代理|等待.*结果|等结果/i.test(t) ||
        /^waiting for (the )?(agent|subagent|result)/i.test(t));
}
/** Evidence that parent recovered/used subagent output (not just dispatched). */
export function isSpawnResultRecoveredMessage(msg) {
    if (!msg || !msg.trim())
        return false;
    const t = msg.trim();
    return (/\b(get_task_output|subagent (result|output|replied|returned)|integrated (findings|results)|from (the )?subagent)\b/i.test(t) ||
        /子代理.*(结果|输出|回报)|回收.*结果|整合.*发现/i.test(t));
}
function reasonForYank(role, yankCount, max) {
    const roleBit = role ? ` (**${role}**)` : "";
    const wave = `yank ${yankCount}/${max}`;
    if (yankCount >= max) {
        return [
            "<OMG_SPAWN_FOLLOWTHROUGH>",
            `Subagent follow-through${roleBit} — final reminder (${wave}).`,
            "",
            "You still have not shown result recovery after spawn. Do this now:",
            "1) **get_task_output** (or read the spawn tool reply) for the subagent id,",
            "2) Quote concrete findings (paths, symbols, decisions) in your next action,",
            "3) Edit code / update plan / spawn the *next* specialist with a new goal.",
            "Do not end the turn with only 'spawned' / 'waiting' / idle fluff.",
            "</OMG_SPAWN_FOLLOWTHROUGH>",
        ].join("\n");
    }
    return [
        "<OMG_SPAWN_FOLLOWTHROUGH>",
        `Subagent spawn armed follow-through${roleBit} (${wave}).`,
        "Last reply was idle or spawn-announce only — recover the result before stopping.",
        "",
        "Continue the parent loop:",
        "1) Wait for / read the subagent result (`get_task_output` or the tool reply),",
        "2) Integrate findings into code or plan, or",
        "3) Spawn the next specialist with a concrete goal — do not stop after only dispatching.",
        "</OMG_SPAWN_FOLLOWTHROUGH>",
    ].join("\n");
}
/**
 * Stop gate: pending + (idle | spawn-announce) => block up to MAX_YANKS.
 * Progress or result-recovery language clears pending.
 */
export function spawnFollowThroughStopReason(input, cfg) {
    const st = load(input, cfg);
    if (!st.pending)
        return null;
    const msg = input.lastAssistantMessage;
    const idle = isIdleAssistantMessage(msg);
    const announce = isSpawnAnnounceMessage(msg);
    const recovered = isSpawnResultRecoveredMessage(msg);
    if (recovered || (!idle && !announce)) {
        save(input, cfg, { ...st, pending: false, yankCount: 0 });
        return null;
    }
    const nextYank = (st.yankCount || 0) + 1;
    const max = SPAWN_FOLLOWTHROUGH_MAX_YANKS;
    const keepPending = nextYank < max;
    save(input, cfg, {
        ...st,
        pending: keepPending,
        yankCount: nextYank,
    });
    return reasonForYank(st.lastRole, nextYank, max);
}
//# sourceMappingURL=spawn-followthrough.js.map