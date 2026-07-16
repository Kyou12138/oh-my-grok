import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { normalizeToolName } from "./skill-gate.js";
function cachePath(input, cfg) {
    const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
    ensureDir(p.session);
    return path.join(p.session, "hashline.json");
}
export function loadHashline(input, cfg) {
    return readJson(cachePath(input, cfg), {
        schemaVersion: 1,
        files: {},
    });
}
export function saveHashline(input, cfg, state) {
    writeJsonAtomic(cachePath(input, cfg), state);
}
/** Short stable tag like omo LINE#ID (2 base36-ish chars). */
export function lineTag(line) {
    const h = crypto.createHash("sha1").update(line).digest();
    const n = h.readUInt16BE(0) % 1296; // 36^2
    return n.toString(36).toUpperCase().padStart(2, "0");
}
export function contentHash(text) {
    return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}
export function annotateLines(text, maxLines = 200) {
    const lines = text.split(/\r?\n/);
    const tags = [""];
    const out = [];
    const limit = Math.min(lines.length, maxLines);
    for (let i = 0; i < lines.length; i++) {
        const tag = lineTag(lines[i]);
        tags.push(tag);
        if (i < limit) {
            out.push(`${i + 1}#${tag}| ${lines[i]}`);
        }
    }
    if (lines.length > maxLines) {
        out.push(`… (${lines.length - maxLines} more lines; re-Read full file if needed)`);
    }
    return { tags, annotated: out.join("\n"), lineCount: lines.length };
}
function resolvePath(input, filePath) {
    // path.resolve 自带 normalize,且对绝对/相对、盘符、混合分隔符的解析比
    // path.join + path.normalize 更健壮(Windows 混合分隔符/大小写盘符场景)。
    // 单参数绝对路径等价于 path.normalize;多参数等价于 normalize(join(base, file))。
    const base = input.workspaceRoot || input.cwd || ".";
    return path.resolve(base, filePath);
}
export function recordRead(input, cfg, filePath) {
    if (!cfg.hashline || !filePath)
        return null;
    const abs = resolvePath(input, filePath);
    try {
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile())
            return null;
        const text = fs.readFileSync(abs, "utf8");
        const st = fs.statSync(abs);
        const { tags, annotated, lineCount } = annotateLines(text);
        const entry = {
            path: abs,
            contentHash: contentHash(text),
            mtimeMs: st.mtimeMs,
            lineCount,
            lineTags: tags,
            annotatedPreview: annotated,
            readAt: Date.now(),
        };
        const state = loadHashline(input, cfg);
        state.files[abs.replace(/\\/g, "/").toLowerCase()] = entry;
        // also key by relative if possible
        const rel = path.relative(input.workspaceRoot, abs);
        if (rel && !rel.startsWith("..")) {
            state.files[rel.replace(/\\/g, "/").toLowerCase()] = entry;
        }
        // prune old
        const now = Date.now();
        for (const [k, v] of Object.entries(state.files)) {
            if (now - v.readAt > cfg.hashlineTtlMs)
                delete state.files[k];
        }
        saveHashline(input, cfg, state);
        return entry;
    }
    catch {
        return null;
    }
}
export function getCached(input, cfg, filePath) {
    const state = loadHashline(input, cfg);
    const abs = resolvePath(input, filePath);
    const keys = [
        abs.replace(/\\/g, "/").toLowerCase(),
        filePath.replace(/\\/g, "/").toLowerCase(),
    ];
    for (const k of keys) {
        if (state.files[k])
            return state.files[k];
    }
    return undefined;
}
/** Expand LINE#ID refs in old_string to plain text for matching, or validate tags. */
const LINE_REF = /^(\d+)#([A-Z0-9]{2})\|\s?(.*)$/;
/** Grok read_file line format: LINE_NUMBER→LINE_CONTENT (not part of file bytes). */
const GROK_READ_LINE = /^(\d+)→(.*)$/;
/**
 * Strip display prefixes from old_string before disk match:
 * - Hashline anchors: `N#TAG| body`
 * - Grok read_file: `N→body` (v1.1.10 — agents often paste tool output into old_string)
 */
export function stripHashlinePrefixes(text) {
    return text
        .split(/\r?\n/)
        .map((line) => {
        const hl = line.match(LINE_REF);
        if (hl)
            return hl[3];
        const grok = line.match(GROK_READ_LINE);
        if (grok)
            return grok[2];
        return line;
    })
        .join("\n");
}
export function hashlinePreToolDeny(input, cfg) {
    if (!cfg.hashline)
        return null;
    // Letters-only normalize so SearchReplace / search-replace hit replace branch
    // (v1.1.6: old lower-only + search_replace underscore check missed CamelCase)
    const toolNorm = normalizeToolName(input.toolName || "");
    const file = String(input.toolInput?.file_path ??
        input.toolInput?.path ??
        input.toolInput?.filePath ??
        input.toolInput?.target_file ??
        "");
    if (!file)
        return null;
    const abs = resolvePath(input, file);
    let current = "";
    let mtimeMs = 0;
    try {
        if (fs.existsSync(abs)) {
            current = fs.readFileSync(abs, "utf8");
            mtimeMs = fs.statSync(abs).mtimeMs;
        }
    }
    catch {
        /* new file */
    }
    const cached = getCached(input, cfg, file);
    const isReplace = toolNorm.includes("strreplace") ||
        toolNorm.includes("searchreplace") ||
        toolNorm.includes("edit"); // edit, editfile, editnotebook, multiedit
    // Require a recent Read before mutating existing files
    if (current && !cached) {
        return [
            "[Hashline] No fresh Read cache for this file.",
            `File: ${file}`,
            "",
            "How to fix:",
            "1) Call **Read** (or read_file) on this exact path first — that builds the Hashline cache.",
            "2) Copy **exact** current bytes into StrReplace old_string (no paraphrasing).",
            "3) Optional: use LINE#TAG anchors from <HASHLINE_CACHE> in the next UserPrompt.",
            "Skill: hashline-edit · skill-gate may require reading it before edits.",
        ].join("\n");
    }
    if (cached && Date.now() - cached.readAt > cfg.hashlineTtlMs) {
        return [
            `[Hashline] Read cache expired for ${file}.`,
            "How to fix: **Read** the file again, then retry the edit with fresh old_string.",
            `TTL: ${Math.round(cfg.hashlineTtlMs / 60000)} minutes since last Read.`,
        ].join("\n");
    }
    if (cached && current) {
        const liveHash = contentHash(current);
        if (liveHash !== cached.contentHash || (mtimeMs && mtimeMs !== cached.mtimeMs)) {
            // file changed on disk since read
            if (liveHash !== cached.contentHash) {
                return [
                    "[Hashline] File changed since last Read (stale cache).",
                    `File: ${file}`,
                    `was=${cached.contentHash} now=${liveHash}`,
                    "How to fix: **Read** again (disk or another agent changed the file), then edit.",
                ].join("\n");
            }
        }
    }
    if (isReplace) {
        const oldRaw = String(input.toolInput?.old_string ??
            input.toolInput?.oldString ??
            input.toolInput?.old_str ??
            input.toolInput?.search ??
            "");
        if (!oldRaw)
            return null;
        // Validate LINE#ID tags if present — never silently accept mismatched anchors
        const lines = oldRaw.split(/\r?\n/);
        const fileLines = current ? current.split(/\r?\n/) : [];
        let hasTags = false;
        for (const line of lines) {
            const m = line.match(LINE_REF);
            if (!m)
                continue;
            hasTags = true;
            if (!cached) {
                return [
                    "[Hashline] LINE#ID anchors require a fresh Read cache.",
                    `File: ${file}`,
                    "How to fix: **Read** the file, then paste lines from <HASHLINE_CACHE> (format N#TAG| text).",
                ].join("\n");
            }
            const lineNo = Number(m[1]);
            const tag = m[2];
            const body = m[3] ?? "";
            const expected = cached.lineTags[lineNo];
            if (!expected) {
                return [
                    "[Hashline] LINE#ID unknown line number (outside last Read).",
                    `line ${lineNo} not in cache (file has ${cached.lineCount} lines).`,
                    `Re-Read: ${file}`,
                ].join("\n");
            }
            if (expected !== tag) {
                return [
                    "[Hashline] LINE#ID mismatch — content moved or stale.",
                    `line ${lineNo}: expected #${expected}, got #${tag}`,
                    `Re-Read: ${file} and copy anchors from the new <HASHLINE_CACHE>.`,
                ].join("\n");
            }
            // Body after tag must match the live file line (tag alone is not enough)
            const liveLine = fileLines[lineNo - 1];
            if (liveLine !== undefined && body !== liveLine) {
                return [
                    "[Hashline] LINE#ID body mismatch — tag ok but line text differs.",
                    `line ${lineNo}: cache/tag #${tag}`,
                    `expected body: ${JSON.stringify(liveLine)}`,
                    `got body:      ${JSON.stringify(body)}`,
                    `Re-Read: ${file}`,
                ].join("\n");
            }
        }
        const oldPlain = stripHashlinePrefixes(oldRaw);
        if (current && oldPlain && !current.includes(oldPlain)) {
            return [
                "[Hashline] old_string not found in current file (stale edit).",
                `File: ${file}`,
                hasTags
                    ? "LINE#ID anchors were used but plain content no longer matches. Re-Read and retry."
                    : "How to fix: **Read** the file; set old_string to exact disk bytes (no `N→` Grok prefixes, no paraphrasing).",
            ].join("\n");
        }
    }
    return null;
}
export function hashlineUserContext(input, cfg) {
    if (!cfg.hashline)
        return "";
    const state = loadHashline(input, cfg);
    const entries = Object.values(state.files)
        .filter((e, i, arr) => arr.findIndex((x) => x.path === e.path) === i)
        .sort((a, b) => b.readAt - a.readAt)
        .slice(0, 3);
    if (!entries.length)
        return "";
    const blocks = entries.map((e) => `### ${e.path}\nhash=${e.contentHash} lines=${e.lineCount}\n\`\`\`\n${e.annotatedPreview}\n\`\`\``);
    return [
        "<HASHLINE_CACHE>",
        "Recent reads with LINE#ID anchors (oh-my-grok Hashline).",
        "Workflow: Read → edit with exact text → optional anchors.",
        "Format: N#TAG| content  — TAG must match this cache; body after | must match the live line.",
        "Do not StrReplace without a prior Read of the same path in this session.",
        ...blocks,
        "</HASHLINE_CACHE>",
    ].join("\n");
}
//# sourceMappingURL=hashline.js.map