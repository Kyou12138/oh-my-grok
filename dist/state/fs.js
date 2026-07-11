import fs from "node:fs";
import path from "node:path";
export function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}
export function readJson(file, fallback) {
    try {
        if (!fs.existsSync(file))
            return fallback;
        const raw = fs.readFileSync(file, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
export function writeJsonAtomic(file, data) {
    ensureDir(path.dirname(file));
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
    fs.renameSync(tmp, file);
}
export function readText(file) {
    try {
        if (!fs.existsSync(file))
            return null;
        return fs.readFileSync(file, "utf8");
    }
    catch {
        return null;
    }
}
export function writeTextAtomic(file, text) {
    ensureDir(path.dirname(file));
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text, "utf8");
    fs.renameSync(tmp, file);
}
export function removeFile(file) {
    try {
        if (fs.existsSync(file))
            fs.unlinkSync(file);
    }
    catch {
        /* ignore */
    }
}
export function listFilesRecursive(dir, pred) {
    const out = [];
    if (!fs.existsSync(dir))
        return out;
    const walk = (d) => {
        let entries;
        try {
            entries = fs.readdirSync(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of entries) {
            const p = path.join(d, e.name);
            if (e.isDirectory())
                walk(p);
            else if (e.isFile() && pred(e.name))
                out.push(p);
        }
    };
    walk(dir);
    return out;
}
//# sourceMappingURL=fs.js.map