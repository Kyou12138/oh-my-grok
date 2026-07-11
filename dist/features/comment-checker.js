/**
 * Comment checker — flag AI-slop narration comments (omo-aligned, lightweight).
 * Soft mode: PostTool warning. Deny mode: PreTool deny.
 */
import fs from "node:fs";
import path from "node:path";
/** Patterns that typically restate code without adding intent. */
const SLOP_LINE = /^\s*(?:\/\/|\/\*+|\*|#)\s*(?:this\s+(?:function|method|class|component|variable|constant|code|file|hook|handler)|returns?\s+the\s+|gets?\s+the\s+|sets?\s+the\s+|imports?\s+|exports?\s+|defines?\s+|creates?\s+a\s+|helper\s+function|utility\s+function|main\s+function|entry\s+point|TODO:\s*implement|FIXME:\s*implement)/i;
const EMOJI_COMMENT = /^\s*(?:\/\/|\/\*+|\*|#).*(?:🚀|✨|🎉|💡|🔥|✅|❌|👉|⭐|😊|👍)/;
const NARRATION = /^\s*(?:\/\/|\/\*+|\*)\s*(?:here we|now we|we (?:are|will)|simply|basically|just (?:a|an|the)?\s)/i;
const SKIP_EXT = /\.(md|mdx|txt|json|yml|yaml|toml|lock|svg|png|jpg|jpeg|gif|webp)$/i;
export function findCommentSlop(content, filePath = "") {
    if (!content || (filePath && SKIP_EXT.test(filePath)))
        return [];
    const hits = [];
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/^\s*(?:\/\/|\/\*|\*|#)/.test(line))
            continue;
        if (SLOP_LINE.test(line)) {
            hits.push({ line: i + 1, snippet: line.trim().slice(0, 120), reason: "restates code" });
        }
        else if (EMOJI_COMMENT.test(line)) {
            hits.push({ line: i + 1, snippet: line.trim().slice(0, 120), reason: "emoji decoration" });
        }
        else if (NARRATION.test(line)) {
            hits.push({ line: i + 1, snippet: line.trim().slice(0, 120), reason: "narration comment" });
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
/** PostTool soft warning context. */
export function commentCheckerPostWarn(input, cfg) {
    if (!cfg.commentChecker)
        return "";
    const { content, filePath } = extractWriteContent(input.toolInput);
    // After Write, content may only be on disk
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
    return formatCommentHits(hits, filePath);
}
//# sourceMappingURL=comment-checker.js.map