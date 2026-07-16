/**
 * Walk from a file up to workspace root collecting AGENTS.md / README snippets.
 */
import fs from "node:fs";
import path from "node:path";
import { canonicalizeTargetPath, isPathInside } from "../state/path-boundary.js";

const MAX = 6_000;

/** Truncate at a code-point boundary (not UTF-16 code unit) to keep UTF-8 well-formed. */
function truncateByCodePoints(str: string, max: number): string {
  if (/^[\x00-\x7F]*$/.test(str)) return str.slice(0, max); // ASCII fast path
  return Array.from(str).slice(0, max).join("");
}

export function collectDirectoryContext(
  workspaceRoot: string,
  filePath: string,
): string {
  if (!filePath || !workspaceRoot) return "";
  const rootReal = canonicalizeTargetPath(workspaceRoot, ".");
  const targetReal = canonicalizeTargetPath(workspaceRoot, filePath);
  if (!rootReal || !targetReal || !isPathInside(rootReal, targetReal)) return "";

  let dir = targetReal;
  try {
    if (fs.existsSync(targetReal) && fs.statSync(targetReal).isFile()) {
      dir = path.dirname(targetReal);
    }
  } catch {
    return "";
  }

  const chunks: string[] = [];
  let guard = 0;
  while (guard++ < 32 && isPathInside(rootReal, dir)) {
    for (const name of ["AGENTS.md", "agents.md"]) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) {
        try {
          const ruleReal = canonicalizeTargetPath(rootReal, file);
          if (!ruleReal || !isPathInside(rootReal, ruleReal)) break;
          const body = truncateByCodePoints(fs.readFileSync(ruleReal, "utf8"), 2000);
          chunks.push(`### ${path.relative(rootReal, ruleReal) || name}\n${body}`);
        } catch {
          /* 忽略不可读的目录规则文件。 */
        }
        break;
      }
    }
    if (dir === rootReal) break;
    const parent = path.dirname(dir);
    if (parent === dir || !isPathInside(rootReal, parent)) break;
    dir = parent;
  }
  if (!chunks.length) return "";
  let text = chunks.join("\n\n");
  if (text.length > MAX) text = truncateByCodePoints(text, MAX) + "\n…[truncated]";
  return `<OMG_DIR_AGENTS>\nNearby AGENTS.md for context:\n${text}\n</OMG_DIR_AGENTS>`;
}
