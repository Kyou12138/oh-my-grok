import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { EnvConfig, HookInput } from "../protocol/types.js";
import { ensureDir, readJson, writeJsonAtomic } from "../state/fs.js";
import { pathsFor } from "../state/paths.js";
import { normalizeToolName } from "./skill-gate.js";
import { pathsFromToolInput } from "./tool-paths.js";

export interface HashlineFileCache {
  path: string;
  contentHash: string;
  mtimeMs: number;
  lineCount: number;
  /** short line tags: index 0 unused, 1..n */
  lineTags: string[];
  /** first lines for context inject (capped) */
  annotatedPreview: string;
  readAt: number;
}

export interface HashlineState {
  schemaVersion: 1;
  files: Record<string, HashlineFileCache>;
}

function cachePath(input: HookInput, cfg: EnvConfig): string {
  const p = pathsFor(input.workspaceRoot, input.sessionId, cfg);
  ensureDir(p.session);
  return path.join(p.session, "hashline.json");
}

export function loadHashline(input: HookInput, cfg: EnvConfig): HashlineState {
  return readJson<HashlineState>(cachePath(input, cfg), {
    schemaVersion: 1,
    files: {},
  });
}

export function saveHashline(input: HookInput, cfg: EnvConfig, state: HashlineState): void {
  writeJsonAtomic(cachePath(input, cfg), state);
}

/** Short stable tag like omo LINE#ID (2 base36-ish chars). */
export function lineTag(line: string): string {
  const h = crypto.createHash("sha1").update(line).digest();
  const n = h.readUInt16BE(0) % 1296; // 36^2
  return n.toString(36).toUpperCase().padStart(2, "0");
}

export function contentHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function annotateLines(text: string, maxLines = 200): {
  tags: string[];
  annotated: string;
  lineCount: number;
} {
  const lines = text.split(/\r?\n/);
  const tags: string[] = [""];
  const out: string[] = [];
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

function resolvePath(input: HookInput, filePath: string): string {
  // path.resolve 自带 normalize,且对绝对/相对、盘符、混合分隔符的解析比
  // path.join + path.normalize 更健壮(Windows 混合分隔符/大小写盘符场景)。
  // 单参数绝对路径等价于 path.normalize;多参数等价于 normalize(join(base, file))。
  const base = input.workspaceRoot || input.cwd || ".";
  return path.resolve(base, filePath);
}

export function recordRead(
  input: HookInput,
  cfg: EnvConfig,
  filePath: string,
): HashlineFileCache | null {
  if (!cfg.hashline || !filePath) return null;
  const abs = resolvePath(input, filePath);
  try {
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    const text = fs.readFileSync(abs, "utf8");
    const st = fs.statSync(abs);
    const { tags, annotated, lineCount } = annotateLines(text);
    const entry: HashlineFileCache = {
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
      if (now - v.readAt > cfg.hashlineTtlMs) delete state.files[k];
    }
    saveHashline(input, cfg, state);
    return entry;
  } catch {
    return null;
  }
}

export function getCached(
  input: HookInput,
  cfg: EnvConfig,
  filePath: string,
): HashlineFileCache | undefined {
  const state = loadHashline(input, cfg);
  const abs = resolvePath(input, filePath);
  const keys = [
    abs.replace(/\\/g, "/").toLowerCase(),
    filePath.replace(/\\/g, "/").toLowerCase(),
  ];
  for (const k of keys) {
    if (state.files[k]) return state.files[k];
  }
  return undefined;
}

/**
 * Expand LINE#ID refs in old_string to plain text for matching, or validate tags.
 * v1.1.41: optional leading whitespace (pasted tool output / indented blocks).
 */
const LINE_REF = /^\s*(\d+)#([A-Z0-9]{2})\|\s?(.*)$/;
/**
 * Grok / host read_file line formats (not file bytes):
 * - `N→body` (unicode arrow, v1.1.10)
 * - `N->body` (ASCII arrow — models often retype)
 * Leading whitespace allowed (v1.1.41).
 */
const GROK_READ_LINE = /^\s*(\d+)(?:→|->)(.*)$/;

/**
 * Strip display prefixes from old_string before disk match:
 * - Hashline anchors: `N#TAG| body`
 * - Grok read_file: `N→body` / `N->body` (agents often paste tool output into old_string)
 */
export function stripHashlinePrefixes(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const hl = line.match(LINE_REF);
      if (hl) return hl[3];
      const grok = line.match(GROK_READ_LINE);
      if (grok) return grok[2];
      return line;
    })
    .join("\n");
}

/** CRLF/CR → LF for old_string↔disk comparison (v1.1.34). */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * True if needle appears in haystack, allowing LF vs CRLF mismatch.
 * Exact match first; then newline-normalized (Windows paste false-stale fix).
 */
export function contentIncludes(haystack: string, needle: string): boolean {
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  return normalizeNewlines(haystack).includes(normalizeNewlines(needle));
}

export function hashlinePreToolDeny(
  input: HookInput,
  cfg: EnvConfig,
): string | null {
  if (!cfg.hashline) return null;
  // Letters-only normalize so SearchReplace / search-replace hit replace branch
  // (v1.1.6: old lower-only + search_replace underscore check missed CamelCase)
  const toolNorm = normalizeToolName(input.toolName || "");
  const paths = pathsFromToolInput(input.toolInput);
  // Pathless mutating tools would skip Hashline entirely — fail closed (v1.1.31).
  // MultiEdit was covered in v1.1.22; Write/StrReplace/ApplyPatch/Delete empty path
  // previously returned null (bypass).
  if (!paths.length) {
    if (toolNorm.includes("multiedit")) {
      return [
        "[Hashline] MultiEdit has no file path(s).",
        "How to fix: set edits[].path (or file_path) for every edit entry.",
      ].join("\n");
    }
    if (toolNorm.includes("applypatch")) {
      return [
        "[Hashline] ApplyPatch has no parseable file path(s).",
        "How to fix: include `*** Update|Add|Delete File: <path>` (or diff --git) in the patch body,",
        "or set top-level path / file_path. Empty/malformed patch is denied.",
      ].join("\n");
    }
    // Any other mutating write/edit/delete tool without a path is also deny
    if (
      toolNorm.includes("write") ||
      toolNorm.includes("strreplace") ||
      toolNorm.includes("searchreplace") ||
      toolNorm === "edit" ||
      toolNorm === "editfile" ||
      toolNorm === "create" ||
      toolNorm === "createfile" ||
      toolNorm.includes("delete") ||
      toolNorm.includes("notebook")
    ) {
      return [
        "[Hashline] Mutating tool has no file path.",
        `Tool: ${input.toolName || toolNorm}`,
        "How to fix: set path / file_path / target_file (or notebook_path) before edit.",
      ].join("\n");
    }
    return null;
  }

  // Batch tools: require Read on every existing path (v1.1.22 MultiEdit bypass fix)
  // Single-path top-level old_string only when not MultiEdit (edits[] handled below)
  const isMulti =
    toolNorm.includes("multiedit") ||
    (Array.isArray(input.toolInput?.edits) &&
      (input.toolInput!.edits as unknown[]).length > 0);
  const checkOldString = paths.length === 1 && !isMulti;
  for (const file of paths) {
    const deny = hashlineDenyOneFile(input, cfg, file, toolNorm, checkOldString);
    if (deny) return deny;
  }
  // v1.1.24: MultiEdit must not skip per-entry old_string freshness
  if (isMulti) {
    const batchDeny = hashlineDenyBatchEdits(input, cfg);
    if (batchDeny) return batchDeny;
  }
  return null;
}

/** Per-entry old_string validation for MultiEdit / batch tools. */
function hashlineDenyBatchEdits(
  input: HookInput,
  cfg: EnvConfig,
): string | null {
  const ti = input.toolInput;
  if (!ti) return null;
  const batches = [ti.edits, ti.files, ti.operations, ti.changes];
  for (const batch of batches) {
    if (!Array.isArray(batch)) continue;
    for (const item of batch) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const file = String(
        o.file_path ?? o.path ?? o.filePath ?? o.target_file ?? o.targetFile ?? "",
      );
      if (!file) continue;
      const abs = resolvePath(input, file);
      let current = "";
      try {
        if (fs.existsSync(abs)) current = fs.readFileSync(abs, "utf8");
      } catch {
        /* new */
      }
      if (!current) continue; // new file create entry

      const oldRaw = String(
        o.old_string ?? o.oldString ?? o.old_str ?? o.search ?? "",
      );
      if (!oldRaw.trim()) {
        return [
          "[Hashline] MultiEdit empty old_string on existing file.",
          `File: ${file}`,
          "How to fix: set edits[].old_string to exact disk bytes (after Read).",
        ].join("\n");
      }
      const oldPlain = stripHashlinePrefixes(oldRaw);
      if (oldPlain && !contentIncludes(current, oldPlain)) {
        return [
          "[Hashline] MultiEdit old_string not found (stale edit).",
          `File: ${file}`,
          "How to fix: **Read** the file; set edits[].old_string to exact disk bytes.",
        ].join("\n");
      }
    }
  }
  return null;
}

function hashlineDenyOneFile(
  input: HookInput,
  cfg: EnvConfig,
  file: string,
  toolNorm: string,
  checkOldString: boolean,
): string | null {
  const abs = resolvePath(input, file);
  let current = "";
  let mtimeMs = 0;
  try {
    if (fs.existsSync(abs)) {
      current = fs.readFileSync(abs, "utf8");
      mtimeMs = fs.statSync(abs).mtimeMs;
    }
  } catch {
    /* new file */
  }

  const cached = getCached(input, cfg, file);
  // Replace-family needs old_string. Notebook cell tools use new_source / cell
  // fields — do NOT treat notebookedit/editnotebook as strreplace (v1.1.28).
  const isNotebookTool =
    toolNorm.includes("notebookedit") || toolNorm.includes("editnotebook");
  const isReplace =
    !isNotebookTool &&
    (toolNorm.includes("strreplace") ||
      toolNorm.includes("searchreplace") ||
      toolNorm === "edit" ||
      toolNorm === "editfile" ||
      toolNorm.includes("multiedit"));

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

  // Write/Create with explicit empty contents on an existing file = accidental wipe
  // createfile (CreateFile) must match create — was missing in v1.1.15 wipe gate
  const isFullWrite =
    toolNorm === "write" ||
    toolNorm === "writefile" ||
    toolNorm === "create" ||
    toolNorm === "createfile";
  if (isFullWrite && current) {
    const hasKey =
      input.toolInput &&
      ("contents" in input.toolInput ||
        "content" in input.toolInput ||
        "body" in input.toolInput);
    if (hasKey) {
      const body = String(
        input.toolInput?.contents ??
          input.toolInput?.content ??
          input.toolInput?.body ??
          "",
      );
      if (body.length === 0) {
        return [
          "[Hashline] Empty Write contents would wipe an existing file.",
          `File: ${file}`,
          "",
          "How to fix: pass non-empty **contents**, or Delete the file intentionally first.",
        ].join("\n");
      }
    }
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

  if (isReplace && checkOldString) {
    const oldRaw = String(
      input.toolInput?.old_string ??
        input.toolInput?.oldString ??
        input.toolInput?.old_str ??
        input.toolInput?.search ??
        "",
    );
    // Grok: empty old_string = create new file only. Existing file + empty = unsafe.
    if (!oldRaw.trim()) {
      if (current) {
        return [
          "[Hashline] Empty old_string is not allowed when the file already exists.",
          `File: ${file}`,
          "",
          "How to fix:",
          "1) For edits: set **old_string** to an exact contiguous snippet from disk (after Read).",
          "2) For full rewrite: use **Write** / WriteFile with full contents (after Read if Hashline is on).",
          "3) Empty old_string is only for creating a **new** file that does not exist yet.",
        ].join("\n");
      }
      return null;
    }

    // Validate LINE#ID tags if present — never silently accept mismatched anchors
    const lines = oldRaw.split(/\r?\n/);
    const fileLines = current ? current.split(/\r?\n/) : [];
    let hasTags = false;
    for (const line of lines) {
      const m = line.match(LINE_REF);
      if (!m) continue;
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
    if (current && oldPlain && !contentIncludes(current, oldPlain)) {
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

export function hashlineUserContext(input: HookInput, cfg: EnvConfig): string {
  if (!cfg.hashline) return "";
  const state = loadHashline(input, cfg);
  const entries = Object.values(state.files)
    .filter((e, i, arr) => arr.findIndex((x) => x.path === e.path) === i)
    .sort((a, b) => b.readAt - a.readAt)
    .slice(0, 3);
  if (!entries.length) return "";
  const blocks = entries.map(
    (e) =>
      `### ${e.path}\nhash=${e.contentHash} lines=${e.lineCount}\n\`\`\`\n${e.annotatedPreview}\n\`\`\``,
  );
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
