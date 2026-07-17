import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJson, readText, removeFile, writeJsonAtomic, writeTextAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { getShellCommand, isMutatingShellCommand, isShellTool, } from "./agent-guard.js";
import { isVerifiedMessage, loadDiag } from "./diagnostics.js";
import { isMutatingTool } from "./skill-gate.js";
import { incompleteTodos } from "./todo-boulder.js";
const DONE_MARKERS = [
    "<promise>DONE</promise>",
    "<promise>done</promise>",
    "RALPH_DONE",
    "ULW_DONE",
];
const DEFAULT_PHASE = "explore";
/** Parse multi-goal task strings: "a; b; c" | "a | b" | "1) a 2) b" */
export function parseGoalsFromTask(task) {
    const t = (task || "").trim();
    if (!t)
        return ["continue work"];
    if (t.includes(";")) {
        const parts = t
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean);
        // Trailing semicolon "a;" → ["a"] (strip empty segments); multi → split
        if (parts.length >= 2)
            return parts;
        if (parts.length === 1 && /;\s*$/.test(t))
            return parts;
    }
    if (t.includes("|")) {
        const parts = t
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean);
        if (parts.length >= 2)
            return parts;
        if (parts.length === 1 && /\|\s*$/.test(t))
            return parts;
    }
    // Numbered goals: allow single-char items ("1) a 2) b") — was [^\d].+? (need ≥2 chars)
    const numbered = [
        ...t.matchAll(/(?:^|[\s,])\d+[.)]\s*(.+?)(?=(?:[\s,]\d+[.)])|$)/g),
    ].map((m) => m[1].trim());
    if (numbered.length >= 2)
        return numbered;
    return [t];
}
export function goalsFromTask(task) {
    return parseGoalsFromTask(task).map((text, i) => ({
        id: `g${i + 1}`,
        text,
        done: false,
    }));
}
export function openGoals(state) {
    return (state.goals || []).filter((g) => !g.done);
}
/** Mark goals done from assistant message: GOAL_DONE: text or <promise>GOAL:text</promise> */
export function applyGoalDoneMarkers(state, msg) {
    if (!msg || !state.goals?.length)
        return state;
    const markers = [];
    for (const m of msg.matchAll(/GOAL_DONE:\s*(.+)$/gim)) {
        markers.push(m[1].trim());
    }
    for (const m of msg.matchAll(/<promise>\s*GOAL:\s*(.+?)\s*<\/promise>/gi)) {
        markers.push(m[1].trim());
    }
    if (!markers.length)
        return state;
    for (const g of state.goals) {
        if (g.done)
            continue;
        const gl = g.text.toLowerCase();
        for (const mk of markers) {
            const mkl = mk.toLowerCase();
            // 精确相等总是命中;否则要求 marker 是 goal 的子串(且 marker 足够具体)。
            // 删除反向 mk.includes(g.text)(短 goal 被长 marker 整段吞的过宽路径);
            // 超短 marker(<=3 字符)只接受精确相等,避免 'GOAL_DONE: a' 单字符误标多 goal。
            if (gl === mkl || (mkl.length > 3 && gl.includes(mkl))) {
                g.done = true;
                break;
            }
        }
    }
    return state;
}
function emptyState(partial) {
    const task = partial.task || "continue work";
    const goals = partial.goals && partial.goals.length
        ? partial.goals
        : goalsFromTask(task);
    return {
        schemaVersion: 3,
        active: true,
        mode: partial.mode,
        task,
        goals,
        iteration: partial.iteration ?? 0,
        maxIterations: partial.maxIterations,
        createdAt: partial.createdAt ?? new Date().toISOString(),
        phase: partial.phase ?? DEFAULT_PHASE,
        phaseReached: partial.phaseReached ?? { explore: false, implement: false, verify: false },
        stallCount: partial.stallCount ?? 0,
        lastActivityAt: partial.lastActivityAt ?? new Date().toISOString(),
        lastActivityFingerprint: partial.lastActivityFingerprint ?? "",
        // ralph has no ULW ceremony; ULW starts unopened until opener line seen
        ceremonyOpened: partial.ceremonyOpened ?? (partial.mode === "ralph" ? true : false),
        researchOnly: partial.researchOnly ??
            (partial.mode === "ulw" ? isUlwResearchOnlyTask(task) : false),
    };
}
function stateJsonPath(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    return path.join(p.ulwDir, "state.json");
}
function activityPath(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    return path.join(p.session, "ulw-activity.json");
}
function parseLegacyMd(text) {
    if (!text)
        return null;
    const mode = /mode:\s*ulw/i.test(text) ? "ulw" : "ralph";
    const taskM = text.match(/^task:\s*(.+)$/m);
    const iterM = text.match(/^iteration:\s*(\d+)/m);
    const maxM = text.match(/^max_iterations:\s*(\d+)/m);
    const phaseM = text.match(/^phase:\s*(explore|implement|verify)/im);
    const task = taskM?.[1]?.trim() ||
        "continue work";
    return emptyState({
        mode,
        task: task.replace(/^task:\s*/i, ""),
        iteration: Number(iterM?.[1] || "0") || 0,
        maxIterations: Number(maxM?.[1] || "50") || 50,
        phase: phaseM?.[1] || DEFAULT_PHASE,
    });
}
export function serializeRalphMd(state) {
    const goalLines = (state.goals || []).map((g) => `- [${g.done ? "x" : " "}] ${g.id}: ${g.text}`);
    return [
        "# oh-my-grok ralph / ulw loop (v3 multi-goal)",
        `mode: ${state.mode}`,
        `task: ${state.task}`,
        `iteration: ${state.iteration}`,
        `max_iterations: ${state.maxIterations}`,
        `phase: ${state.phase}`,
        `stall_count: ${state.stallCount}`,
        `ceremony_opened: ${state.ceremonyOpened ? "true" : "false"}`,
        `research_only: ${state.researchOnly ? "true" : "false"}`,
        `created_at: ${state.createdAt}`,
        "",
        "Goals:",
        ...goalLines,
        "",
        state.mode === "ulw"
            ? "ULW: explore → implement → verify. DONE only after verify evidence + all goals done."
            : "Ralph: make concrete progress each iteration.",
        "Mark goal: GOAL_DONE: <goal text>",
        "Completion: <promise>DONE</promise>",
        "Verify: <promise>VERIFIED</promise> or diagnostics clean / tests passed",
        "",
    ].join("\n");
}
export function loadRalph(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    const jsonPath = stateJsonPath(input, cfg);
    if (fs.existsSync(jsonPath)) {
        const j = readJson(jsonPath, null);
        if (j?.active) {
            const task = j.task || "continue work";
            return emptyState({
                ...j,
                mode: j.mode === "ulw" ? "ulw" : "ralph",
                task,
                goals: j.goals?.length ? j.goals : goalsFromTask(task),
                maxIterations: j.maxIterations || cfg.maxRalphIter,
            });
        }
    }
    const md = readText(p.ralph);
    if (!md)
        return null;
    return parseLegacyMd(md);
}
function persist(input, cfg, state) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.ulwDir);
    ensureDir(p.ulwLogDir);
    writeTextAtomic(p.ralph, serializeRalphMd(state));
    writeJsonAtomic(stateJsonPath(input, cfg), state);
}
export function startRalph(input, cfg, task, mode) {
    const state = emptyState({
        mode,
        task,
        maxIterations: mode === "ulw" ? Math.max(cfg.maxRalphIter, 50) : cfg.maxRalphIter,
        phase: "explore",
        researchOnly: mode === "ulw" ? isUlwResearchOnlyTask(task) : false,
    });
    persist(input, cfg, state);
    resetUlwActivity(input, cfg);
    if (mode === "ulw") {
        writeProgressLog(input, cfg, state, "start", "ULW loop started");
        writeUlwCeremonyFile(input, cfg, task, "start");
    }
    return state;
}
const CEREMONY_BAR = "══════════════════════════════════════════════════════════";
/** EN / ZH ceremony openers — first non-empty assistant line must match exactly. */
export const ULW_CEREMONY_OPENERS = [
    "ULTRAWORK MODE ENABLED!",
    "ULTRAWORK 模式已启动！",
];
/**
 * True when the first non-empty line of the assistant message is an ULW ceremony opener.
 * Allows optional surrounding **bold** markers; rejects if opener is buried mid-message.
 */
export function hasUlwCeremonyOpener(msg) {
    if (!msg)
        return false;
    const lines = msg.replace(/^\uFEFF/, "").split(/\r?\n/);
    const first = (lines.find((l) => l.trim().length > 0) || "").trim();
    if (!first)
        return false;
    // strip optional bold / backticks / quotes (v1.1.55: models wrap opener in fences)
    // v1.1.59: leading markdown quote/heading / gong emoji · trailing !?.。
    let bare = first
        .replace(/^\*\*(.+)\*\*$/, "$1")
        .replace(/^`(.+)`$/, "$1")
        .replace(/^['"](.+)['"]$/, "$1")
        .replace(/^[【\[](.+)[】\]]$/, "$1")
        .trim();
    bare = bare
        // v1.1.60–62: leading !!! / → / numbered / gong / rocket/fire emoji / 【开场】
        .replace(/^【[^】]{0,12}】\s*/u, "")
        .replace(/^(?:[!！]+|\d+[.)、]\s*|[>*#]+\s*|[⚡🔔⚔🎯✅★☆*•·\-–—→➜➔🚀🔥✨]+\s*)+/u, "")
        .replace(/^[「『(\[]/, "")
        .replace(/[」』)\]]$/, "")
        .replace(/[!！.。?？🚀⚡🔔🔥✨]+$/u, "")
        .trim();
    // same-line "OPENER! Goal: …" — take opener prefix only
    const bang = bare.search(/[!！]/);
    if (bang > 0 && bang < bare.length - 1) {
        const head = bare.slice(0, bang + 1).trim();
        const rest = bare.slice(bang + 1).trim();
        if (rest && /^(goal|目标|—|-|–)/i.test(rest))
            bare = head;
    }
    const norm = (s) => s
        .replace(/[!！.。?？🚀⚡🔔🔥✨]+$/u, "")
        .trim()
        .toUpperCase();
    return ULW_CEREMONY_OPENERS.some((o) => {
        if (bare === o || norm(bare) === norm(o))
            return true;
        const nb = norm(bare);
        const no = norm(o);
        if (!nb.startsWith(no))
            return false;
        if (nb.length === no.length)
            return true;
        // trailing noise after opener (space / dash)
        return /^[\s—–\-]/.test(nb.slice(no.length));
    });
}
/** Loud Stop/PreTool deny when ULW started but opener was skipped. */
export function ulwCeremonyIncompleteReason(task) {
    const goal = (task || "ultrawork").trim().slice(0, 200);
    return [
        CEREMONY_BAR,
        "【开场仪式未完成 / OPENING RITUAL INCOMPLETE — CEREMONY】",
        CEREMONY_BAR,
        "ULTRAWORK / ULW LOOP — 你跳过了开场仪式。",
        "未喊口号 · 不得写文件 · 不得变异 shell · 不得 DONE。",
        "（PreTool 硬拦写操作 · Stop 拦截跳过开场的空转）",
        "",
        "🔔 鸣锣三声 · STRIKE THE GONG ×3 · 再开场：",
        "",
        "┌─ 仪式三步 ─────────────────────────────────────────┐",
        "│ 1. **第一行**整行口号（无前缀/后缀/代码围栏）：      │",
        "│      ULTRAWORK MODE ENABLED!                        │",
        "│      ULTRAWORK 模式已启动！                         │",
        "│ 2. **第二行**复述目标：                             │",
        `│      Goal: ${goal.slice(0, 40).padEnd(40)} │`,
        "│ 3. **第三段起**立即 explore（Read / 搜索 / explore）│",
        "└────────────────────────────────────────────────────┘",
        "",
        "【誓词 OATH】未 explore 不写 · 未 verify 不 DONE · 未仪式不开工",
        "Full text: `.omg/ulw-loop/CEREMONY.md`",
        CEREMONY_BAR,
        "  开始。推巨石。不得空转。 · Begin. Push the boulder. No idle turns.",
        CEREMONY_BAR,
    ].join("\n");
}
/**
 * v1.1.58 host-truth: ULW mutates blocked until ceremony opener seen.
 * Read/search/non-mutating shell stay allowed so explore can start after
 * the verbal ritual; Write/Edit/mutating shell denied hard.
 * If `lastAssistantMessage` already opens with the slogan, mark opened and allow.
 */
export function ulwCeremonyPreDeny(input, cfg) {
    const state = loadRalph(input, cfg);
    if (!state?.active || state.mode !== "ulw")
        return null;
    if (state.ceremonyOpened)
        return null;
    // Same-turn: opener already in assistant text → open ceremony and allow
    if (hasUlwCeremonyOpener(input.lastAssistantMessage)) {
        state.ceremonyOpened = true;
        persist(input, cfg, state);
        return null;
    }
    const shell = isShellTool(input.toolName);
    if (shell) {
        const cmd = getShellCommand(input);
        if (!isMutatingShellCommand(cmd))
            return null;
    }
    else if (!isMutatingTool(input.toolName)) {
        return null;
    }
    return ulwCeremonyIncompleteReason(state.task);
}
/**
 * Research / audit / map-only tasks may skip implement writes (omo research path).
 * Default shipping/fix tasks still require implement evidence.
 */
export function isUlwResearchOnlyTask(task) {
    if (!task?.trim())
        return false;
    const t = task.trim();
    // Explicit EN research markers (\b ok for latin)
    if (/\b(research(?:-only)?|investigate|audit(?:-only)?|analyze|analysis|survey|recon|map\s+the|explore\s+only|read-only|readonly)\b/i.test(t)) {
        return true;
    }
    // CJK markers — no \b (word boundary is latin-only in JS)
    if (/(?:只读|仅探索|调研|审查|审计|分析|摸底|盘点)/.test(t)) {
        return true;
    }
    // Pure question / locate without fix|ship|implement keywords
    if (/^(what|where|how|why|which|find|locate|list|summarize|explain)\b/i.test(t) &&
        !/\b(fix|implement|ship|add|write|build|refactor|migrate|feature|bug|patch|deploy)\b/i.test(t)) {
        return true;
    }
    return false;
}
/**
 * v1.1.63 host-truth: 未 explore 不写 — after ceremony, mutates still blocked
 * until at least one Read (phaseReached.explore). Aligns omo oath + Hard PreTool.
 */
export function ulwExplorePreDeny(input, cfg) {
    const state = loadRalph(input, cfg);
    if (!state?.active || state.mode !== "ulw")
        return null;
    if (!state.ceremonyOpened)
        return null; // ceremony gate owns this
    if (state.phaseReached.explore)
        return null;
    const shell = isShellTool(input.toolName);
    if (shell) {
        const cmd = getShellCommand(input);
        // allow verify/read shells; block mutates
        if (!isMutatingShellCommand(cmd))
            return null;
    }
    else if (!isMutatingTool(input.toolName)) {
        return null;
    }
    const goal = (state.task || "ultrawork").trim().slice(0, 200);
    return [
        CEREMONY_BAR,
        "【未 explore 不写 / EXPLORE BEFORE WRITE — ULW】",
        CEREMONY_BAR,
        "ULTRAWORK 誓词：未 explore 不得写文件 / 不得变异 shell。",
        `Goal: ${goal}`,
        "",
        "先完成至少一次 **Read / 搜索 / spawn explore**，再 implement。",
        "State: `.omg/ulw-loop/state.json` · phase must show explore=true",
        CEREMONY_BAR,
    ].join("\n");
}
/**
 * omo-style ULW opening ceremony (soft inject + disk file + Stop gate).
 * Loud frame + ordered ritual — first assistant reply MUST open with ULTRAWORK MODE ENABLED!
 */
export function ulwCeremonyBanner(task, kind = "start") {
    const goal = (task || "ultrawork until fully done").trim().slice(0, 400);
    if (kind === "active") {
        return [
            '<ultrawork-mode active="true">',
            CEREMONY_BAR,
            "  🔔  ULTRAWORK 仍在运行 · MODE STILL ON · 续推巨石",
            CEREMONY_BAR,
            `🎯 Goal: ${goal}`,
            "Phases: explore → implement → verify · 不得空转 · 未 VERIFIED 不得 DONE",
            "",
            "若本轮是重新接手 / 新对话切入：先完成开场仪式——",
            "  第一行 `ULTRAWORK MODE ENABLED!` 或 `ULTRAWORK 模式已启动！`",
            "  第二行复述 Goal · 第三段起 explore",
            "未开场：PreTool **硬拦**写文件/变异 shell；Stop → CEREMONY INCOMPLETE",
            "State: `.omg/ulw-loop/` · ceremony: `.omg/ulw-loop/CEREMONY.md`",
            CEREMONY_BAR,
            "  开始。推巨石。不得空转。",
            CEREMONY_BAR,
            "</ultrawork-mode>",
        ].join("\n");
    }
    const headline = kind === "upgrade"
        ? "  **ULTRAWORK MODE ENABLED!**  ·  (Ralph → ULW 升级 / upgraded from Ralph)"
        : "  **ULTRAWORK MODE ENABLED!**";
    const subtitle = kind === "upgrade"
        ? "  ⚔  oh-my-grok · ULW v3 · maximum intensity · 由 Ralph 晋升"
        : "  ⚔  oh-my-grok · ULW v3 · maximum intensity · 全力直到完成";
    return [
        "<ultrawork-mode>",
        CEREMONY_BAR,
        "  🔔🔔🔔  鸣锣开场 · STRIKE THE GONG · ULW OPENING RITUAL",
        headline,
        subtitle,
        CEREMONY_BAR,
        "",
        "【开场仪式 OPENING RITUAL — 必做，不可跳过 · host 硬门】",
        "",
        "┌─ 三步仪式 ──────────────────────────────────────────┐",
        "│ 1. **第一行**必须整行口号（无前缀/后缀/代码围栏）：  │",
        "│      ULTRAWORK MODE ENABLED!                         │",
        "│      ULTRAWORK 模式已启动！                          │",
        "│ 2. **第二行**一句话复述目标（见 Goal）               │",
        "│ 3. **第三段起**立即 **explore**（Read/搜索/explore） │",
        "│    — 不得只表态 · 不得先写文件                      │",
        "└─────────────────────────────────────────────────────┘",
        "",
        "【誓词 OATH】",
        "  未 explore 不写 · 未 verify 不 DONE · 未仪式不开工。",
        "  I will not write before explore, not DONE before verify, not work before ceremony.",
        "",
        "禁止：只回 ok / 继续 / 好的 · 跳过开场 · 空转闲聊 · 未 VERIFIED 就 DONE",
        "硬门：未开场 → PreTool 拒绝 Write/Edit/变异 shell；Stop → CEREMONY INCOMPLETE",
        "",
        `🎯 Goal: ${goal}`,
        "Phases: explore → implement → verify",
        "Done gate: 开场仪式 + VERIFIED + 读写/测试证据 + 全部 GOAL_DONE；未完成 todos 阻塞 DONE",
        "Prefer host **task**（explore / hephaestus）。Logs: `.omg/ulw-loop/log/`",
        "Full reminder on disk: `.omg/ulw-loop/CEREMONY.md`",
        "",
        CEREMONY_BAR,
        "  开始。推巨石。不得空转。 · Begin. Push the boulder. No idle turns.",
        CEREMONY_BAR,
        "</ultrawork-mode>",
    ].join("\n");
}
export function writeUlwCeremonyFile(input, cfg, task, kind = "start") {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.ulwDir);
    const file = path.join(p.ulwDir, "CEREMONY.md");
    const body = [
        "# ULW 开场仪式 / Opening ceremony",
        "",
        ulwCeremonyBanner(task, kind).replace(/<\/?ultrawork-mode[^>]*>/g, "").trim(),
        "",
        `updatedAt: ${new Date().toISOString()}`,
        "",
    ].join("\n");
    writeTextAtomic(file, body);
    return file;
}
export function cancelRalph(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    removeFile(p.ralph);
    removeFile(stateJsonPath(input, cfg));
    // v1.1.28: drop ceremony banner file when loop ends
    removeFile(path.join(p.ulwDir, "CEREMONY.md"));
}
export function bumpRalph(input, cfg, state) {
    state.iteration += 1;
    state.lastActivityAt = new Date().toISOString();
    persist(input, cfg, state);
    return state;
}
export function saveRalph(input, cfg, state) {
    persist(input, cfg, state);
}
export function isDoneMessage(msg) {
    if (!msg)
        return false;
    // 否定语境紧邻 DONE 标记不算完成(对齐 isVerifiedMessage 的 v0.13/v0.14 修复)。
    // processLoopStop 在 ralph 模式对 isDoneMessage 命中直接 cancelRalph 不经 gate,
    // 故 'not ULW_DONE' / 'NOT <promise>DONE</promise>' / 'will never mark RALPH_DONE'
    // / 'no ULW_DONE yet' 等否定话术必须被拦,否则一句否定关闭整个 loop。
    const DONE_RE = /(?:<promise>DONE<\/promise>|<promise>done<\/promise>|RALPH_DONE|ULW_DONE)/i;
    if (!DONE_RE.test(msg) && !DONE_MARKERS.some((m) => msg.includes(m))) {
        return false;
    }
    // v1.1.28: cannot/unable/impossible/refuse/missing/far from 否定话术不得关 loop
    const NEGATED_DONE = /\b(?:not|never|without|no|cannot|can'?t|unable|impossible|refuse|refusing|missing|far\s+from|rarely|seldom|hardly|barely|scarcely|don'?t|doesn'?t|isn'?t|aren'?t|wasn'?t|weren'?t|won'?t|wouldn'?t|shouldn'?t|couldn'?t|mustn'?t|haven'?t|hasn'?t|hadn'?t|ain'?t|didn'?t)\b[^.!\n]*(?:<promise>DONE<\/promise>|<promise>done<\/promise>|RALPH_DONE|ULW_DONE)/i;
    if (NEGATED_DONE.test(msg))
        return false;
    // v1.1.15: partial-done hedges (align isVerifiedMessage v1.1.14)
    // v1.1.45: later/after/once/pending/todo/skip — deferred claims must not cancel loop
    // v1.1.55: for now / soft / effectively / marked DONE — provisional claims close loop early
    const HEDGED_AFTER = /(?:<promise>DONE<\/promise>|<promise>done<\/promise>|RALPH_DONE|ULW_DONE)(?:-ish|\s*\(\s*wip\s*\)|\s+wip\b)|(?:<promise>DONE<\/promise>|<promise>done<\/promise>|RALPH_DONE|ULW_DONE)[^.!\n]{0,80}\b(except|but|however|not\s+all|remaining|still|partial|incomplete|failing|failed|later|after|once|when|until|then|pending|todo|skip|wait|yet|soon|for\s+now|for\s+today|temporarily|temporary|shipped|wip)\b/i;
    const HEDGED_BEFORE = /\b(almost|nearly|mostly|partially|roughly|will|going\s+to|gonna|plan(?:ning)?\s+to|intend(?:ing)?\s+to|should|must|need\s+to|about\s+to|pending|todo|skip(?:ping)?|wait(?:ing)?|before|later|soon|soft|provisional(?:ly)?|functional(?:ly)?|effective(?:ly)?|temporary|consider|treat\s+as|marking|marked(?:\s+as)?|i(?:'ll|\s+will)\s+mark|shipped\s+as)\b[^.!\n]{0,80}(?:<promise>DONE<\/promise>|<promise>done<\/promise>|RALPH_DONE|ULW_DONE)/i;
    if (HEDGED_AFTER.test(msg) || HEDGED_BEFORE.test(msg))
        return false;
    // Chinese negation near marker (v1.1.28: 无法/不能/没法/难以)
    // v1.1.45: 稍后/之后 deferred
    if (/(?:未|没有|没|并非|不|无法|不能|没法|难以|稍后|待会|之后|以后|还要|尚未)[^。\n]{0,24}(?:ULW_DONE|RALPH_DONE|DONE)|(?:ULW_DONE|RALPH_DONE)[^。\n]{0,24}(?:未完成|还没|仍有|之后|以后)/.test(msg)) {
        return false;
    }
    return DONE_MARKERS.some((m) => msg.includes(m));
}
/** Detect ralph/ulw start — mid-sentence ulw/ultrawork supported. */
export function detectRalphCommand(prompt) {
    const p = prompt.trim();
    if (/^\/cancel-ralph\b/i.test(p) || /^cancel-ralph\b/i.test(p)) {
        return { action: "cancel", task: "" };
    }
    const ralph = p.match(/^\/ralph-loop(?:\s+["']?(.+?)["']?)?\s*$/i) || p.match(/^\/ralph-loop\s+(.+)/is);
    if (ralph) {
        return { action: "start-ralph", task: (ralph[1] || "complete the current task").trim() };
    }
    // Explicit slash forms
    const ulwSlash = p.match(/^\/ulw-loop(?:\s+["']?(.+?)["']?)?\s*$/i) ||
        p.match(/^\/ultrawork(?:\s+["']?(.+?)["']?)?\s*$/i) ||
        p.match(/^\/ulw(?:\s+["']?(.+?)["']?)?\s*$/i);
    if (ulwSlash) {
        return {
            action: "start-ulw",
            task: (ulwSlash[1] || "ultrawork until fully done").trim(),
        };
    }
    // Mid-sentence / leading keywords (omo-style): "ulw 重构登录", "please ultrawork this".
    // \b matches before hyphen in JS — reject ulw-stop / ulw_foo with (?![-_]), keep CJK glue (ulw重构).
    const ulwKeyword = /\bultrawork\b/i.test(p) ||
        /\bulw-loop\b/i.test(p) ||
        /(^|[\s,;:，])ulw\b(?![-_])/i.test(p) ||
        /^\s*ulw\b(?![-_])/i.test(p);
    if (ulwKeyword) {
        let task = p
            .replace(/\bultrawork\b/gi, " ")
            .replace(/\bulw-loop\b/gi, " ")
            .replace(/(^|[\s,;:，])ulw\b(?![-_])/gi, "$1")
            .replace(/^\s*ulw\b(?![-_])/gi, " ")
            .replace(/^\/+/, "")
            .replace(/\s+/g, " ")
            .trim();
        if (!task)
            task = "ultrawork until fully done";
        return { action: "start-ulw", task };
    }
    return { action: null, task: "" };
}
// ─── Activity tracking ───────────────────────────────────────────────
export function loadUlwActivity(input, cfg) {
    return readJson(activityPath(input, cfg), {
        schemaVersion: 1,
        reads: 0,
        writes: 0,
        shells: 0,
        lastPaths: [],
        updatedAt: "",
    });
}
export function resetUlwActivity(input, cfg) {
    writeJsonAtomic(activityPath(input, cfg), {
        schemaVersion: 1,
        reads: 0,
        writes: 0,
        shells: 0,
        lastPaths: [],
        updatedAt: new Date().toISOString(),
    });
}
export function noteUlwRead(input, cfg, filePath) {
    const a = loadUlwActivity(input, cfg);
    a.reads += 1;
    // v1.1.63: unlock explore PreTool gate mid-turn (not only on Stop)
    const loop = loadRalph(input, cfg);
    if (loop?.active && loop.mode === "ulw") {
        if (!loop.phaseReached.explore) {
            loop.phaseReached.explore = true;
            if (loop.phase === "explore")
                loop.phase = "implement";
            saveRalph(input, cfg, loop);
        }
    }
    if (filePath)
        a.lastPaths = [...new Set([filePath, ...a.lastPaths])].slice(0, 12);
    a.updatedAt = new Date().toISOString();
    writeJsonAtomic(activityPath(input, cfg), a);
}
export function noteUlwWrite(input, cfg, filePath) {
    const a = loadUlwActivity(input, cfg);
    a.writes += 1;
    if (filePath)
        a.lastPaths = [...new Set([filePath, ...a.lastPaths])].slice(0, 12);
    a.updatedAt = new Date().toISOString();
    writeJsonAtomic(activityPath(input, cfg), a);
    // v1.1.63: mark implement mid-turn so verify shell can credit after writes
    const loop = loadRalph(input, cfg);
    if (loop?.active && loop.mode === "ulw" && !loop.phaseReached.implement) {
        loop.phaseReached.implement = true;
        if (loop.phase === "explore" || loop.phase === "implement") {
            loop.phase = "verify";
        }
        saveRalph(input, cfg, loop);
    }
}
/**
 * Commands that count as verification evidence for ULW.
 * v1.1.40: bun/deno/yarn run test/make test
 * v1.1.47: cargo nextest / just|task test / playwright|cypress / tox|hatch
 * v1.1.48: flutter/phpunit/rspec/mix/sbt/bazel test
 * v1.1.50: node --test / mocha/ava/pest / rails / mono / static analysis
 * v1.1.51: dart/swift/nx run-many / turbo test / fmt-check / audit / bats
 * v1.1.52: terraform validate/fmt-check / shellcheck / rubocop / format:check / govulncheck
 * v1.1.53: rustfmt --check / gofmt -l / composer validate / pint --test
 * v1.1.54: tsc … --noEmit / nx run :test / pnpm -r test / gradlew check / detox|maestro
 * v1.1.56: newman / k6 / cargo tarpaulin|llvm-cov / coverage run
 */
export const VERIFY_SHELL_RE = /\b(npm\s+(test|audit|run\s+(test|ci|typecheck|type-check|types:check|check-types|check:types|lint|check|doctor|validate|coverage|format:check|fmt:check)(:[\w-]*)?)|pnpm\s+(-[rw]\s+)?(test|audit|run\s+(test|typecheck|type-check|types:check|check-types|check:types|lint|check|coverage)|typecheck|type-check|check-types|check:types|lint)|pnpm\s+--filter\s+\S+\s+test|yarn\s+(test|audit|coverage|run\s+(test|typecheck|type-check|check-types|check:types|lint|check|coverage)|typecheck|type-check|check-types|check:types|lint)|yarn\s+workspace\s+\S+\s+test|yarn\s+workspaces\s+foreach[^|&;\n]*\btest\b|bun\s+(test|run\s+(test|lint|check|typecheck|type-check|check-types|coverage))|deno\s+(test|lint|check)|node\s+--test|tsx\s+--test|vitest|jest|mocha|ava|pytest|py\.test|python3?\s+-m\s+(pytest|unittest)|(?:python3?\s+)?manage\.py\s+test|poetry\s+run\s+pytest|uv\s+run\s+(pytest|ruff|mypy)|hatch\s+run\s+test|cargo\s+(test|nextest|clippy|check|audit|deny|tarpaulin|llvm-cov|fuzz)|cargo\s+fmt[^|&;\n]*--check|rustfmt\s+--check|nextest\s+run|go\s+(test|vet)|go\s+fmt\s+-l|gofmt\s+-l|gotestsum|ginkgo|staticcheck|govulncheck|dotnet\s+test|dotnet\s+format[^|&;\n]*--verify|mvn\b[^|&;\n]*\b(test|verify)\b|gradlew?\s+(test|check)|make\s+(test|check|lint)|just\s+(test|check|lint)|task\s+(test|check|lint)|mise\s+run\s+(test|check|lint)|turbo\s+(run\s+)?(test|lint|typecheck|type-check|check-types|check:types)|nx\s+(test|lint)|nx\s+run\s+\S*(?:test|lint|typecheck|type-check|check-types)\b|nx\s+(run-many|affected)[^|&;\n]*\b(test|lint|typecheck|type-check|check-types|check:types)\b|lerna\s+run\s+(test|lint)|rush\s+test|moon\s+run\s+[^\n]*:test\b|playwright\s+test|cypress\s+run|detox\s+test|maestro\s+test|tox|hatch\s+test|flutter\s+(test|analyze)|dart\s+(test|analyze|format\s+--set-exit-if-changed)|phpunit|pest|php\s+artisan\s+test|rspec|bin\/rspec|rails\s+test|bin\/rails\s+test|rake\s+test|mix\s+(test|credo|format\s+--check)|sbt\s+test|lein\s+test|stack\s+test|cabal\s+test|bazel\s+test|pants\s+test|buck2?\s+test|please\s+test|earthly\s+\+?test|dagger\s+run\s+test|zig\s+(?:build\s+)?test|crystal\s+spec|swift\s+test|swiftlint|xcodebuild\s+test|fastlane\s+(tests?|scan)|ctest|cmake\b[^|&;\n]*--target\s+test|meson\s+test|ninja\b[^|&;\n]*\btest\b|bats|shellspec|ng\s+test|ember\s+test|cucumber(?:-js)?|behave|robot|wdio\s+run|karma\s+start|testcafe|newman\s+run|k6\s+run|artillery\s+run|coverage\s+run|typecheck|tsc\b[^|&;\n]*--noEmit|tsc\s+(-b|--build)|vue-tsc|svelte-check|astro\s+check|oxlint|ruff\s+check(?![^|&;\n]*--fix)|ruff\s+format\s+--check|black\s+--check|isort\s+--check|flake8|pylint|mypy|pyright|basedpyright|ty\s+check|biome\s+(check|ci)|coverage\s+report|nox\s+-s\s+\S+|pixi\s+run\s+(test|check|lint)|stylelint|kubeconform|kubeval|kube-linter|helm\s+lint|prettier\s+--check|eslint|lint|semgrep|bandit|pip-audit|composer\s+(audit|validate|test)|bundle\s+audit|ant\s+test|sbt\s+test(?:Only)?|pint\s+--test|php-cs-fixer[^|&;\n]*--dry-run|terraform\s+(validate|fmt\s+-check)|tflint|tfsec|checkov|shellcheck|actionlint|hadolint|yamllint|markdownlint|typos|codespell|cspell|dprint\s+check|spotless\s+check|scalafmt\s+--test|rubocop|standardrb|brakeman|ktlint|opa\s+test|conftest\s+test)\b/i;
/** echo/printf of test names is not verification evidence. */
const ECHO_LIKE_RE = /^(echo|printf|Write-Host|console\.log)\b/i;
export function isVerifyShellCommand(command) {
    if (!command)
        return false;
    // Split compound shells so "echo npm test" is rejected but "echo x && npm test" still counts.
    const segments = command.split(/&&|\|\||;|\n/).map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0)
        return false;
    return segments.some((seg) => !ECHO_LIKE_RE.test(seg) && VERIFY_SHELL_RE.test(seg));
}
/**
 * Record shell/terminal activity for ULW.
 * Test/lint/typecheck commands auto-mark verify phase when a ULW loop is active.
 */
export function noteUlwShell(input, cfg, command) {
    const a = loadUlwActivity(input, cfg);
    a.shells += 1;
    if (command) {
        a.lastPaths = [...new Set([`shell:${command.slice(0, 80)}`, ...a.lastPaths])].slice(0, 12);
    }
    a.updatedAt = new Date().toISOString();
    writeJsonAtomic(activityPath(input, cfg), a);
    if (isVerifyShellCommand(command)) {
        const loop = loadRalph(input, cfg);
        // Phase UI may advance to verify on tests; DONE gate still requires
        // implement writes unless research-only (v1.1.63).
        if (loop?.active && loop.mode === "ulw") {
            markVerifyReached(loop);
            saveRalph(input, cfg, loop);
        }
    }
}
export function activityFingerprint(a) {
    return `r${a.reads}:w${a.writes}:s${a.shells}`;
}
/** Advance phase from observed activity since last stop. */
export function advancePhaseFromActivity(state, activity) {
    if (activity.reads > 0) {
        state.phaseReached.explore = true;
        if (state.phase === "explore")
            state.phase = "implement";
    }
    if (activity.writes > 0) {
        state.phaseReached.implement = true;
        if (state.phase === "explore" || state.phase === "implement") {
            state.phase = "verify";
        }
    }
    if (activity.shells > 0 && state.phaseReached.implement) {
        // shell after implement can mean verify in progress
        if (state.phase === "implement")
            state.phase = "verify";
    }
    return state;
}
export function markVerifyReached(state) {
    state.phaseReached.verify = true;
    state.phase = "verify";
    return state;
}
// ─── DONE gate (ULW hard) ────────────────────────────────────────────
export function ulwDoneGate(input, cfg, state, msg) {
    if (state.mode !== "ulw") {
        return { ok: true, reason: "" };
    }
    const problems = [];
    const diag = loadDiag(input, cfg);
    const act = loadUlwActivity(input, cfg);
    const research = state.researchOnly ?? isUlwResearchOnlyTask(state.task);
    const verified = isVerifiedMessage(msg) ||
        Boolean(diag.verifiedAt && diag.verifiedAt > 0 && !diag.needsVerify && !diag.lastErrors);
    // v1.1.63: explore is mandatory for all ULW (including research)
    if (!state.phaseReached.explore) {
        problems.push("- Explore phase incomplete — Read/search codebase (spawn explore if useful).");
    }
    // v1.1.63: implement required unless research-only task
    // (was bypassable: markVerifyReached via shell alone set phase=verify without writes)
    const hasImplement = state.phaseReached.implement || act.writes > 0;
    if (!hasImplement && !research) {
        problems.push("- No implementation writes observed. Implement before DONE (research/audit tasks may omit writes if task text is research-only).");
    }
    if (!verified && !state.phaseReached.verify) {
        problems.push("- ULW requires verify evidence: output <promise>VERIFIED</promise>, or say diagnostics clean / tests passed, after running checks.");
    }
    if (diag.lastErrors) {
        problems.push("- Diagnostics still failing — fix before DONE.");
    }
    const todos = incompleteTodos(input, cfg);
    if (todos.length > 0) {
        problems.push(`- ${todos.length} incomplete todo(s) remain — finish or cancel them.`);
    }
    // Multi-goal only: single-goal loops still complete via VERIFIED+DONE alone
    const open = openGoals(state);
    if (state.goals.length > 1 && open.length > 0) {
        problems.push(`- ${open.length} open goal(s) remain — mark each with GOAL_DONE: <text> before DONE:`, ...open.slice(0, 8).map((g) => `  - [ ] ${g.text}`));
    }
    if (problems.length) {
        return {
            ok: false,
            reason: [
                "ULW DONE REJECTED — evidence gate failed.",
                `Task: ${state.task}`,
                `Phase: ${state.phase} | reached: explore=${state.phaseReached.explore} implement=${state.phaseReached.implement} verify=${state.phaseReached.verify}${research ? " | research-only=true" : ""}`,
                "",
                ...problems,
                "",
                "Continue ULW. When fully done with evidence, output <promise>VERIFIED</promise> then <promise>DONE</promise>.",
            ].join("\n"),
        };
    }
    return { ok: true, reason: "" };
}
/** @deprecated use applyGoalDoneMarkers */
export function markGoalDone(state, text) {
    return applyGoalDoneMarkers(state, `GOAL_DONE: ${text}`);
}
// ─── Progress log + stop reason ──────────────────────────────────────
export function writeProgressLog(input, cfg, state, kind, note) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.ulwLogDir);
    const act = loadUlwActivity(input, cfg);
    const file = path.join(p.ulwLogDir, `iter-${String(state.iteration).padStart(3, "0")}-${kind}.md`);
    const body = [
        `# ULW iter ${state.iteration} (${kind})`,
        "",
        `- time: ${new Date().toISOString()}`,
        `- task: ${state.task}`,
        `- phase: ${state.phase}`,
        `- stall: ${state.stallCount}`,
        `- activity: reads=${act.reads} writes=${act.writes} shells=${act.shells}`,
        `- paths: ${act.lastPaths.slice(0, 8).join(", ") || "(none)"}`,
        "",
        note,
        "",
    ].join("\n");
    writeTextAtomic(file, body);
}
export function ralphStopReason(state, opts) {
    if (state.mode === "ralph") {
        return [
            "RALPH LOOP — work until done.",
            `Task: ${state.task}`,
            `Iteration: ${state.iteration + 1}/${state.maxIterations}`,
            "",
            "You MUST continue. Make concrete progress.",
            "When fully complete, output: <promise>DONE</promise>",
        ].join("\n");
    }
    const phaseHelp = {
        explore: "PHASE explore: Search codebase (spawn explore). Read key files. List findings. Do NOT claim DONE. PreTool: mutates blocked until explore evidence.",
        implement: "PHASE implement: Apply code changes (hephaestus ok). Keep diffs focused. Update todos. Do NOT DONE before VERIFIED.",
        verify: "PHASE verify: Run tests/typecheck/lint. Fix failures. Then <promise>VERIFIED</promise> and only then <promise>DONE</promise>.",
    };
    const open = openGoals(state);
    const goalBlock = state.goals?.length > 1
        ? [
            "Goals checklist:",
            ...state.goals.map((g) => `- [${g.done ? "x" : " "}] ${g.text}`),
            open.length
                ? `Open: ${open.length}. Mark done: GOAL_DONE: <goal text>`
                : "All goals marked done.",
            "",
        ]
        : [];
    const stalls = opts?.stallCount ?? state.stallCount;
    let stallBlock = "";
    if (opts?.stall || stalls >= 1) {
        if (stalls >= 5) {
            stallBlock = [
                "",
                "🛑 STALL CRITICAL (×" + stalls + ") — 连续空转，策略必须换：",
                "1) **task** spawn **oracle** 或 **explore** 重新定位瓶颈",
                "2) 缩小范围：只修 1 个文件 / 1 个失败测试",
                "3) 跑具体命令拿证据（npm test / tsc --noEmit），禁止再只回 status",
                "4) 若目标不可达：写清 blocker，勿假 DONE",
            ].join("\n");
        }
        else if (stalls >= 3) {
            stallBlock = [
                "",
                "⚠ STALL ESCALATED (×" + stalls + ") — 第三次+无进度：",
                "- Change strategy NOW: spawn explore/oracle/hephaestus",
                "- Or run real verify (tests/typecheck) and report output",
                "- No pure ack / 继续 / looking into it",
            ].join("\n");
        }
        else {
            stallBlock =
                "\n⚠ STALL DETECTED: no Read/Write/Shell progress last round. Change strategy — spawn oracle/explore, run tests, narrow scope, or try a different approach.";
        }
    }
    return [
        "══════════════════════════════════════",
        "ULTRAWORK / ULW LOOP v3 — maximum intensity · omo-aligned",
        "══════════════════════════════════════",
        `Task: ${state.task}`,
        `Iteration: ${state.iteration + 1}/${state.maxIterations}`,
        `Phase: ${state.phase}`,
        `Progress: explore=${state.phaseReached.explore} implement=${state.phaseReached.implement} verify=${state.phaseReached.verify}`,
        `Stall count: ${stalls}`,
        isUlwResearchOnlyTask(state.task) ? "Mode: research-only (implement writes optional)" : "",
        "",
        ...goalBlock,
        phaseHelp[state.phase],
        "",
        "MANDATORY each iteration:",
        "1) Concrete action (search / edit / test) — no pure status chatter",
        "2) Prefer spawn_subagent: explore → hephaestus → verify",
        "3) Log what changed in your reply (files + commands)",
        "",
        "DONE gate (hard):",
        "- Ceremony opener + explore Read evidence",
        "- Implement writes (unless research-only task)",
        "- VERIFIED (or diagnostics clean / tests passed)",
        "- All multi-goals marked GOAL_DONE",
        "- Incomplete todos block DONE",
        "- Then output: <promise>DONE</promise>",
        stallBlock,
        "══════════════════════════════════════",
    ]
        .filter(Boolean)
        .join("\n");
}
/** Process one Stop event for an active loop. Returns block reason or null if loop ended cleanly. */
export function processLoopStop(input, cfg, state) {
    const msg = input.lastAssistantMessage;
    const activity = loadUlwActivity(input, cfg);
    // Apply activity → phase
    if (state.mode === "ulw") {
        advancePhaseFromActivity(state, activity);
        if (isVerifiedMessage(msg) || (loadDiag(input, cfg).verifiedAt && !loadDiag(input, cfg).lastErrors)) {
            markVerifyReached(state);
        }
        // v1.1.49: mark opening ceremony when first line is the ritual opener
        if (hasUlwCeremonyOpener(msg)) {
            state.ceremonyOpened = true;
        }
    }
    // Apply GOAL_DONE markers every stop
    applyGoalDoneMarkers(state, msg);
    // Single-goal: DONE claim implies that one goal is complete
    if (isDoneMessage(msg) && state.goals.length === 1) {
        state.goals[0].done = true;
    }
    // v1.1.49: ULW ceremony gate — no DONE and no silent continue without opener
    if (state.mode === "ulw" && !state.ceremonyOpened) {
        const ceremonyReason = ulwCeremonyIncompleteReason(state.task);
        state.iteration += 1;
        writeProgressLog(input, cfg, state, "ceremony-incomplete", "opening ritual skipped");
        resetUlwActivity(input, cfg);
        persist(input, cfg, state);
        return { block: true, reason: ceremonyReason, state };
    }
    // DONE claim
    if (isDoneMessage(msg)) {
        if (state.mode === "ulw") {
            const gate = ulwDoneGate(input, cfg, state, msg);
            if (!gate.ok) {
                state.iteration += 1;
                writeProgressLog(input, cfg, state, "done-rejected", gate.reason);
                resetUlwActivity(input, cfg);
                persist(input, cfg, state);
                return { block: true, reason: gate.reason, state };
            }
        }
        writeProgressLog(input, cfg, state, "done", "Loop completed");
        cancelRalph(input, cfg);
        return { block: false, reason: "", state };
    }
    // Max iterations
    if (state.iteration >= state.maxIterations) {
        cancelRalph(input, cfg);
        return {
            block: true,
            reason: [
                "RALPH/ULW max iterations reached — loop auto-cancelled.",
                `Task was: ${state.task}`,
                "Summarize progress. Re-run /ulw-loop or /ralph-loop if needed.",
            ].join("\n"),
            state,
        };
    }
    // Stall detection (ULW) — Read, Write, OR Shell counts as progress
    const fp = activityFingerprint(activity);
    const noRwShell = activity.reads === 0 && activity.writes === 0 && activity.shells === 0;
    let stall = false;
    if (state.mode === "ulw") {
        if (state.lastActivityFingerprint && fp === state.lastActivityFingerprint && noRwShell) {
            // compared to previous end-of-iter snapshot stored as last fingerprint with zero delta
            state.stallCount += 1;
            stall = state.stallCount >= 1;
        }
        else if (noRwShell && state.iteration > 0) {
            state.stallCount += 1;
            stall = true;
        }
        else {
            // shells>0 (e.g. npm test) is real progress for shell→verify
            state.stallCount = 0;
        }
        state.lastActivityFingerprint = fp;
    }
    // v1.1.64: omo-style max-stall circuit — auto-cancel after N consecutive idle rounds
    // default 8 when cfg omits field (tests often construct partial EnvConfig)
    const maxStall = typeof cfg.maxUlwStall === "number" && cfg.maxUlwStall >= 0
        ? cfg.maxUlwStall
        : 8;
    if (state.mode === "ulw" &&
        stall &&
        maxStall > 0 &&
        state.stallCount >= maxStall) {
        state.iteration += 1;
        writeProgressLog(input, cfg, state, "stall-circuit", `stall circuit open at ${state.stallCount}/${maxStall}`);
        const reason = ulwStallCircuitReason(state, maxStall);
        cancelRalph(input, cfg);
        return { block: true, reason, state };
    }
    // Continue
    state.iteration += 1;
    writeProgressLog(input, cfg, state, "continue", stall ? "stall continuation" : `continue phase=${state.phase}`);
    resetUlwActivity(input, cfg);
    persist(input, cfg, state);
    return {
        block: true,
        reason: ralphStopReason(state, { stall, stallCount: state.stallCount }),
        state,
    };
}
/** Loud one-shot when ULW cancels after too many no-progress stops. */
export function ulwStallCircuitReason(state, maxStall) {
    return [
        CEREMONY_BAR,
        "【ULW STALL CIRCUIT OPEN / 空转熔断 — LOOP CANCELLED】",
        CEREMONY_BAR,
        `连续 ${state.stallCount} 轮无 Read/Write/Shell 进度（阈值 maxUlwStall=${maxStall}）。`,
        "Loop 已自动取消（对齐 omo todo stagnation circuit：停止空转 yank）。",
        "",
        `Task was: ${state.task}`,
        `Phase was: ${state.phase} · explore=${state.phaseReached.explore} implement=${state.phaseReached.implement} verify=${state.phaseReached.verify}`,
        `Iteration: ${state.iteration}/${state.maxIterations}`,
        "",
        "Next:",
        "1) 写清 blocker / 换策略（spawn explore|oracle，缩小范围）",
        "2) 需要继续时重新 /ulw-loop \"…\"",
        "3) 调高阈值：`.omg/config.json` → `maxUlwStall` 或 env `OMG_MAX_ULW_STALL`（0=关闭熔断）",
        CEREMONY_BAR,
    ].join("\n");
}
//# sourceMappingURL=ralph.js.map