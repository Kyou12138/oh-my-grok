import fs from "node:fs";
import path from "node:path";

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}

export function readText(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function writeTextAtomic(file: string, text: string): void {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

export function removeFile(file: string): void {
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
}

export function listFilesRecursive(dir: string, pred: (name: string) => boolean): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && pred(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}
