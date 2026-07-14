import fs from "node:fs";
import path from "node:path";
import { readJson } from "../state/fs.js";
function envBool(name, defaultOn) {
    const v = process.env[name];
    if (v === undefined)
        return defaultOn;
    return v !== "0" && v.toLowerCase() !== "false";
}
function envNum(name, fallback) {
    const n = Number(process.env[name] || "");
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
/**
 * Base config from env, then overlay .omg/config.json (workspace wins for toggles).
 */
export function loadConfig(workspaceRoot) {
    const home = process.env.GROK_HOME || process.env.USERPROFILE || process.env.HOME || "";
    const pluginRoot = process.env.GROK_PLUGIN_ROOT || process.cwd();
    const pluginData = process.env.GROK_PLUGIN_DATA ||
        (home
            ? `${home.replace(/\\/g, "/")}/.grok/state/oh-my-grok`
            : `${pluginRoot}/.omg-plugin-data`);
    let file = {};
    const stateDirName = process.env.OMG_STATE_DIR || ".omg";
    if (workspaceRoot) {
        const cfgPath = path.isAbsolute(stateDirName)
            ? path.join(stateDirName, "config.json")
            : path.join(workspaceRoot, stateDirName, "config.json");
        if (fs.existsSync(cfgPath)) {
            file = readJson(cfgPath, {});
        }
    }
    return {
        pluginRoot,
        pluginData,
        grokHome: home ? `${home.replace(/\\/g, "/")}/.grok` : "",
        stateDirName: file.stateDir || stateDirName,
        skillGate: file.skillGate ?? envBool("OMG_SKILL_GATE", true),
        intentGate: file.intentGate ?? envBool("OMG_INTENT_GATE", true),
        planMode: file.planMode ?? envBool("OMG_PLAN_MODE", true),
        hashline: file.hashline ?? envBool("OMG_HASHLINE", true),
        diagEnforce: file.diagEnforce ?? envBool("OMG_DIAG_ENFORCE", true),
        hardOrchestration: file.hardOrchestration ?? envBool("OMG_HARD_ORCH", true),
        maxRalphIter: file.maxRalphIter ?? envNum("OMG_MAX_RALPH_ITER", 50),
        todoCooldownMs: file.todoCooldownMs ?? envNum("OMG_TODO_COOLDOWN_MS", 5000),
        todoAbortWindowMs: envNum("OMG_TODO_ABORT_WINDOW_MS", 3000),
        diagCommand: (file.diagCommand ??
            process.env.OMG_DIAG_CMD ??
            "").trim(),
        diagTimeoutMs: file.diagTimeoutMs ?? envNum("OMG_DIAG_TIMEOUT_MS", 60000),
        hashlineTtlMs: file.hashlineTtlMs ?? envNum("OMG_HASHLINE_TTL_MS", 30 * 60 * 1000),
        commentChecker: file.commentChecker ?? envBool("OMG_COMMENT_CHECKER", true),
        commentCheckerDeny: file.commentCheckerDeny ??
            (process.env.OMG_COMMENT_CHECKER === "deny" ||
                envBool("OMG_COMMENT_CHECKER_DENY", false)),
        agentGuard: file.agentGuard ?? envBool("OMG_AGENT_GUARD", true),
        categoryDiscipline: file.categoryDiscipline ?? envBool("OMG_CATEGORY_DISCIPLINE", true),
    };
}
/** @deprecated use loadConfig */
export function readEnvConfig() {
    return loadConfig(process.env.GROK_WORKSPACE_ROOT || process.cwd());
}
//# sourceMappingURL=config.js.map