/**
 * Comment checker — flag AI-slop narration comments (omo-aligned).
 * Soft mode: PostTool warning + session aggregate Stop yank once.
 * Deny mode: PreTool deny.
 */
import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
/** Patterns that typically restate code without adding intent. */
const SLOP_LINE = /^\s*(?:\/\/|\/\*+|\*|#)\s*(?:this\s+(?:function|method|class|component|variable|constant|code|file|hook|handler|module)|returns?\s+the\s+|gets?\s+the\s+|sets?\s+the\s+|imports?\s+|exports?\s+|defines?\s+|creates?\s+a\s+|implements?\s+the\s+|handles?\s+the\s+|helper\s+function|utility\s+function|main\s+function|entry\s+point|TODO:\s*implement|FIXME:\s*implement)/i;
const CHINESE_SLOP = /^\s*(?:\/\/|\/\*+|\*|#)\s*(?:这个(?:函数|方法|类|组件|变量|文件|模块)|用于(?:计算|处理|获取|设置|实现)|返回(?:了)?|获取(?:了)?)/;
const EMOJI_COMMENT = /^\s*(?:\/\/|\/\*+|\*|#).*(?:🚀|✨|🎉|💡|🔥|✅|❌|👉|⭐|😊|👍)/;
const NARRATION = /^\s*(?:\/\/|\/\*+|\*)\s*(?:here we|now we|we (?:are|will)|simply|basically|just (?:a|an|the)?\s)/i;
const SKIP_EXT = /\.(md|mdx|txt|json|yml|yaml|toml|lock|svg|png|jpg|jpeg|gif|webp)$/i;
const AGGREGATE_THRESHOLD = 3;
export function findCommentSlop(content, filePath = "") {
    if (!content || (filePath && SKIP_EXT.test(filePath)))
        return [];
    const hits = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/^\s*(?:\/\/|\/\*|\*|#)/.test(line))
            continue;
        if (SLOP_LINE.test(line) || CHINESE_SLOP.test(line)) {
            hits.push({
                line: i + 1,
                snippet: line.trim().slice(0, 120),
                reason: "restates code",
            });
        }
        else if (EMOJI_COMMENT.test(line)) {
            hits.push({
                line: i + 1,
                snippet: line.trim().slice(0, 120),
                reason: "emoji decoration",
            });
        }
        else if (NARRATION.test(line)) {
            hits.push({
                line: i + 1,
                snippet: line.trim().slice(0, 120),
                reason: "narration comment",
            });
        }
    }
    return hits.slice(0, 12);
}
function extractWriteContent(toolInput) {
    if (!toolInput)
        return { content: "", filePath: "" };
    const filePath = String(toolInput.file_path ??
        toolInput.path ??
        toolInput.filePath ??
        toolInput.target_file ??
        "");
    const content = String(toolInput.contents ??
        toolInput.content ??
        toolInput.new_string ??
        toolInput.newString ??
        toolInput.new_str ??
        toolInput.replace ??
        "");
    return { content, filePath };
}
function aggregatePath(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    return path.join(p.session, "comment-slop.json");
}
export function loadCommentAggregate(input, cfg) {
    return readJson(aggregatePath(input, cfg), {
        schemaVersion: 1,
        hitCount: 0,
        files: [],
        softPrompted: false,
        updatedAt: "",
    });
}
export function recordCommentSlop(input, cfg, filePath, hitCount) {
    const st = loadCommentAggregate(input, cfg);
    st.hitCount += hitCount;
    if (filePath) {
        st.files = [...new Set([filePath, ...st.files])].slice(0, 20);
    }
    st.updatedAt = new Date().toISOString();
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.session);
    writeJsonAtomic(aggregatePath(input, cfg), st);
    return st;
}
export function markCommentSoftPrompted(input, cfg) {
    const st = loadCommentAggregate(input, cfg);
    st.softPrompted = true;
    writeJsonAtomic(aggregatePath(input, cfg), st);
}
/** Stop yank once when session accumulated enough slop hits. */
export function commentAggregateStopReason(input, cfg) {
    if (!cfg.commentChecker)
        return null;
    const st = loadCommentAggregate(input, cfg);
    if (st.softPrompted)
        return null;
    if (st.hitCount < AGGREGATE_THRESHOLD)
        return null;
    return [
        "COMMENT_AGGREGATE — repeated AI-slop comments this session.",
        `Hits: ${st.hitCount} across ${st.files.length} file(s).`,
        st.files.slice(0, 6).map((f) => `- ${f}`).join("\n"),
        "",
        "Remove restating comments (This function… / 这个函数… / Implements the…).",
        "Comment only non-obvious intent/constraints. Then continue.",
    ]
        .filter(Boolean)
        .join("\n");
}
export function formatCommentHits(hits, filePath) {
    const lines = hits.map((h) => `  L${h.line} (${h.reason}): ${h.snippet}`);
    return [
        "<OMG_COMMENT_CHECKER>",
        `AI-slop comments detected in ${filePath || "edit"}:`,
        ...lines,
        "Prefer comments that explain non-obvious intent, constraints, or invariants — not restating the code.",
        "Bypass: set OMG_COMMENT_CHECKER=0 or commentChecker:false in .omg/config.json.",
        "</OMG_COMMENT_CHECKER>",
    ].join("\n");
}
/** PreTool deny when commentCheckerDeny is on. */
export function commentCheckerPreDeny(input, cfg) {
    if (!cfg.commentChecker || !cfg.commentCheckerDeny)
        return null;
    const tool = (input.toolName || "").toLowerCase();
    if (!tool.includes("write") &&
        !tool.includes("strreplace") &&
        !tool.includes("edit")) {
        return null;
    }
    const { content, filePath } = extractWriteContent(input.toolInput);
    if (!content)
        return null;
    const hits = findCommentSlop(content, filePath);
    if (!hits.length)
        return null;
    return formatCommentHits(hits, filePath);
}
/** PostTool soft warning context + aggregate. */
export function commentCheckerPostWarn(input, cfg) {
    if (!cfg.commentChecker)
        return "";
    const { content, filePath } = extractWriteContent(input.toolInput);
    let text = content;
    if (!text && filePath) {
        try {
            const abs = path.isAbsolute(filePath)
                ? filePath
                : path.join(input.workspaceRoot || input.cwd, filePath);
            if (fs.existsSync(abs))
                text = fs.readFileSync(abs, "utf8");
        }
        catch {
            /* ignore */
        }
    }
    if (!text)
        return "";
    const hits = findCommentSlop(text, filePath);
    if (!hits.length)
        return "";
    recordCommentSlop(input, cfg, filePath, hits.length);
    return formatCommentHits(hits, filePath);
}
//# sourceMappingURL=comment-checker.js.map