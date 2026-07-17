/**
 * Collect target paths from tool input (single-file + MultiEdit batches + apply_patch).
 * Grok/Claude may pass path under path / file_path / target_file, or
 * nested edits[] / files[] for MultiEdit — single-path gates must not miss these.
 */

/** Paths from apply_patch / V4A-style patch bodies (*** Update File: …). */
export function pathsFromApplyPatchText(text: string): string[] {
  if (!text?.trim()) return [];
  const out: string[] = [];
  // Optional space before colon: "*** Update File : path" (some model outputs)
  // v1.1.53: "Updated File:" past tense
  const re =
    /^\*\*\*\s+(?:Update|Updated|Add|Delete)\s+File\s*:\s*(.+?)\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const p = m[1].trim().replace(/^["']|["']$/g, "");
    if (p) out.push(p);
  }
  // *** Move to: path / *** Rename to:
  const moveRe = /^\*\*\*\s+(?:Move|Rename)\s+to\s*:\s*(.+?)\s*$/gim;
  while ((m = moveRe.exec(text)) !== null) {
    const p = m[1].trim().replace(/^["']|["']$/g, "");
    if (p) out.push(p);
  }
  // Unified diff fallback (diff --git a/x b/y and ---/+++ headers)
  if (!out.length) {
    const gitRe = /^diff --git a\/(.+?) b\/(.+?)\s*$/gim;
    while ((m = gitRe.exec(text)) !== null) {
      const a = m[1].trim();
      const b = m[2].trim();
      if (a && a !== "/dev/null") out.push(a);
      if (b && b !== "/dev/null" && b !== a) out.push(b);
    }
    const plusMinus = /^(?:\+\+\+|---) [ab]\/(.+?)\s*$/gim;
    while ((m = plusMinus.exec(text)) !== null) {
      const p = m[1].trim();
      if (p && p !== "/dev/null") out.push(p);
    }
  }
  // de-dupe preserve order
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const p of out) {
    const key = p.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  return uniq;
}

export interface ToolContentSnippet {
  filePath: string;
  content: string;
}

/**
 * New content snippets for comment-checker / scan gates.
 * Covers single Write/StrReplace and MultiEdit edits[].
 */
export function contentSnippetsFromToolInput(
  toolInput?: Record<string, unknown> | null,
): ToolContentSnippet[] {
  if (!toolInput || typeof toolInput !== "object") return [];
  const out: ToolContentSnippet[] = [];

  const pushSnippet = (filePath: string, content: unknown) => {
    if (typeof content !== "string" || !content) return;
    out.push({ filePath: filePath || "", content });
  };

  const topPath = String(
    toolInput.file_path ??
      toolInput.path ??
      toolInput.filePath ??
      toolInput.filepath ??
      toolInput.target_file ??
      toolInput.targetFile ??
      toolInput.target_path ??
      toolInput.targetPath ??
      toolInput.target ??
      toolInput.filename ??
      toolInput.file ??
      "",
  );
  // v1.1.53: text/body/new_text/replacement aliases used by some hosts
  // v1.1.58: new_content / code / value / data
  const topContent =
    toolInput.contents ??
    toolInput.content ??
    toolInput.body ??
    toolInput.text ??
    toolInput.code ??
    toolInput.source_code ??
    toolInput.sourceCode ??
    toolInput.new_string ??
    toolInput.newString ??
    toolInput.new_str ??
    toolInput.new_text ??
    toolInput.newText ??
    toolInput.new_content ??
    toolInput.newContent ??
    toolInput.updated_content ??
    toolInput.updatedContent ??
    toolInput.replacement ??
    toolInput.source ??
    toolInput.replace ??
    toolInput.value ??
    toolInput.data;
  if (typeof topContent === "string" && topContent) {
    pushSnippet(topPath, topContent);
  }

  const batches = [toolInput.edits, toolInput.files, toolInput.operations, toolInput.changes];
  for (const batch of batches) {
    if (!Array.isArray(batch)) continue;
    for (const item of batch) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const fp = String(
        o.file_path ??
          o.path ??
          o.filePath ??
          o.filepath ??
          o.target_file ??
          o.targetFile ??
          o.target ??
          o.filename ??
          o.file ??
          "",
      );
      const c =
        o.contents ??
        o.content ??
        o.body ??
        o.text ??
        o.code ??
        o.new_string ??
        o.newString ??
        o.new_str ??
        o.new_text ??
        o.newText ??
        o.new_content ??
        o.newContent ??
        o.replacement ??
        o.source ??
        o.replace ??
        o.value ??
        o.data;
      pushSnippet(fp, c);
    }
  }

  // apply_patch: scan whole patch as one blob (paths still from pathsFromApplyPatchText)
  const patch = toolInput.patch ?? toolInput.diff ?? toolInput.input;
  if (typeof patch === "string" && patch.includes("***") && !out.length) {
    pushSnippet("", patch);
  }

  return out;
}

export function pathsFromToolInput(
  toolInput?: Record<string, unknown> | null,
): string[] {
  if (!toolInput || typeof toolInput !== "object") return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  };

  push(toolInput.file_path);
  push(toolInput.path);
  push(toolInput.filePath);
  push(toolInput.FilePath); // v1.1.59 PascalCase host envelopes
  push(toolInput.filepath); // v1.1.53 lowercase join
  push(toolInput.file_name);
  push(toolInput.fileName);
  push(toolInput.target_file);
  push(toolInput.targetFile);
  push(toolInput.TargetFile);
  push(toolInput.target_path);
  push(toolInput.targetPath);
  push(toolInput.target); // some hosts use bare target
  push(toolInput.relative_path);
  push(toolInput.relativePath);
  push(toolInput.full_path);
  push(toolInput.fullPath);
  push(toolInput.abs_path);
  push(toolInput.absolutePath);
  push(toolInput.fs_path);
  push(toolInput.fsPath);
  push(toolInput.filename);
  push(toolInput.file);
  push(toolInput.File);
  push(toolInput.documentPath);
  push(toolInput.document_path);
  push(toolInput.resourcePath);
  push(toolInput.resource_path);
  // file:// URI / URL (v1.1.55 + documentUri v1.1.58 + fileUri v1.1.60)
  // v1.1.61: vscode-file://vscode-app/c:/path
  for (const u of [
    toolInput.uri,
    toolInput.url,
    toolInput.documentUri,
    toolInput.document_uri,
    toolInput.fileUri,
    toolInput.file_uri,
  ]) {
    if (typeof u !== "string") continue;
    if (/^file:/i.test(u)) {
      try {
        push(decodeURIComponent(u.replace(/^file:\/\//i, "").replace(/^\/([A-Za-z]:)/, "$1")));
      } catch {
        push(u.replace(/^file:\/\//i, ""));
      }
    } else if (/^vscode-file:/i.test(u)) {
      try {
        const stripped = u
          .replace(/^vscode-file:\/\/[^/]+/i, "")
          .replace(/^\/([A-Za-z]:)/, "$1");
        push(decodeURIComponent(stripped));
      } catch {
        push(u.replace(/^vscode-file:\/\/[^/]+/i, ""));
      }
    }
  }

  // string path arrays (v1.1.61)
  for (const key of [
    "files",
    "paths",
    "filePaths",
    "file_paths",
    "target_files",
    "targetFiles",
  ] as const) {
    const arr = toolInput[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === "string") push(item);
    }
  }

  // nested envelope args/input/parameters/options (depth-1, v1.1.61)
  for (const key of ["args", "input", "parameters", "params", "options"] as const) {
    const nest = toolInput[key];
    if (!nest || typeof nest !== "object" || Array.isArray(nest)) continue;
    const n = nest as Record<string, unknown>;
    push(n.file_path);
    push(n.path);
    push(n.filePath);
    push(n.filepath);
    push(n.target_file);
    push(n.targetFile);
    push(n.target);
    push(n.file);
  }
  // rename / move pairs (v1.1.54)
  push(toolInput.from);
  push(toolInput.to);
  push(toolInput.old_path);
  push(toolInput.oldPath);
  push(toolInput.new_path);
  push(toolInput.newPath);
  push(toolInput.source_path);
  push(toolInput.sourcePath);
  push(toolInput.destination);
  push(toolInput.destination_path);
  push(toolInput.destinationPath);
  // NotebookEdit / Jupyter
  push(toolInput.notebook_path);
  push(toolInput.notebookPath);
  push(toolInput.notebook);
  push(toolInput.cellPath);
  push(toolInput.cell_path);

  // single nested edit object (v1.1.60)
  if (toolInput.edit && typeof toolInput.edit === "object") {
    const e = toolInput.edit as Record<string, unknown>;
    push(e.file_path);
    push(e.path);
    push(e.filePath);
    push(e.filepath);
    push(e.target_file);
    push(e.targetFile);
  }

  const batches = [toolInput.edits, toolInput.files, toolInput.operations, toolInput.changes];
  for (const batch of batches) {
    if (!Array.isArray(batch)) continue;
    for (const item of batch) {
      if (typeof item === "string") {
        push(item);
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      push(o.file_path);
      push(o.path);
      push(o.filePath);
      push(o.filepath);
      push(o.file_name);
      push(o.fileName);
      push(o.target_file);
      push(o.targetFile);
      push(o.target_path);
      push(o.targetPath);
      push(o.target);
      push(o.relative_path);
      push(o.relativePath);
      push(o.full_path);
      push(o.fullPath);
      push(o.fs_path);
      push(o.fsPath);
      push(o.filename);
      push(o.file);
      push(o.from);
      push(o.to);
      push(o.old_path);
      push(o.new_path);
    }
  }

  // apply_patch / ApplyPatch: path lives inside patch body
  const patch = toolInput.patch ?? toolInput.diff ?? toolInput.input;
  if (typeof patch === "string") {
    for (const p of pathsFromApplyPatchText(patch)) push(p);
  }

  // de-dupe preserve order
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const p of out) {
    const key = p.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  return uniq;
}
