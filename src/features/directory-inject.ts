/**
 * Walk from a file up to workspace root collecting AGENTS.md / README snippets.
 */
import fs from "node:fs";
import path from "node:path";

const MAX = 6_000;

export function collectDirectoryContext(
  workspaceRoot: string,
  filePath: string,
): string {
  if (!filePath || !workspaceRoot) return "";
  const abs = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.normalize(path.join(workspaceRoot, filePath));
  let dir = fs.existsSync(abs) && fs.statSync(abs).isFile() ? path.dirname(abs) : abs;
  const root = path.normalize(workspaceRoot);
  const chunks: string[] = [];
  let guard = 0;
  while (guard++ < 32) {
    for (const name of ["AGENTS.md", "agents.md"]) {
      const f = path.join(dir, name);
      if (fs.existsSync(f)) {
        try {
          const body = fs.readFileSync(f, "utf8").slice(0, 2000);
          chunks.push(`### ${path.relative(root, f) || name}\n${body}`);
        } catch {
          /* */
        }
        break;
      }
    }
    if (path.normalize(dir) === root) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    // stop if left workspace
    const rel = path.relative(root, parent);
    if (rel.startsWith("..")) break;
    dir = parent;
  }
  if (!chunks.length) return "";
  let text = chunks.join("\n\n");
  if (text.length > MAX) text = text.slice(0, MAX) + "\n…[truncated]";
  return `<OMG_DIR_AGENTS>\nNearby AGENTS.md for context:\n${text}\n</OMG_DIR_AGENTS>`;
}
