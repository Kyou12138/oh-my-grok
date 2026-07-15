import { findLatestHandoff, resumeFromHandoffContext, } from "../features/handoff.js";
import { refreshCatalog } from "../features/skill-gate.js";
import { loadInjectedRules, readPluginVersion, sisyphusBootstrap, usingSuperpowersHint, } from "../features/rules.js";
import { ensureDir, writeJsonAtomic } from "../state/fs.js";
import { pathsFor, sessionStateRoot } from "../state/paths.js";
export function handleSessionStart(input, cfg) {
    ensureDir(sessionStateRoot(cfg));
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.session);
    ensureDir(p.omg);
    const version = readPluginVersion(cfg.pluginRoot);
    writeJsonAtomic(p.fingerprint, {
        schemaVersion: 1,
        plugin: "oh-my-grok",
        version,
        sessionId: input.sessionId,
        workspaceRoot: input.workspaceRoot,
        pid: process.pid,
        at: new Date().toISOString(),
    });
    // Reset prompt count for new session
    writeJsonAtomic(p.promptCount, { n: 0 });
    const catalog = refreshCatalog(input, cfg);
    const latestHandoff = findLatestHandoff(input.workspaceRoot, cfg, input.sessionId);
    const resume = latestHandoff ? resumeFromHandoffContext(latestHandoff) : "";
    const additionalContext = [
        sisyphusBootstrap(),
        usingSuperpowersHint(cfg.pluginRoot),
        loadInjectedRules(input.workspaceRoot, cfg),
        resume,
        `[oh-my-grok] SessionStart OK v${version}. skills=${catalog.catalog.length} fingerprint=${p.fingerprint}`,
        "Do not dual-enable another oh-my-grok (e.g. mihazs Go edition) — hooks will conflict.",
    ]
        .filter(Boolean)
        .join("\n\n");
    return { additionalContext };
}
//# sourceMappingURL=session-start.js.map