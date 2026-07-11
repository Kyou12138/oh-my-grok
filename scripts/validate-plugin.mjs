#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "plugin.json",
  "hooks/hooks.json",
  "dist/cli.js",
  "agents/sisyphus.md",
  "skills/agent-skill-gate/SKILL.md",
  "rules/00-sisyphus.md",
];

let ok = true;
for (const r of required) {
  const p = path.join(root, r);
  if (!fs.existsSync(p)) {
    console.error("MISSING", r);
    ok = false;
  } else {
    console.log("OK", r);
  }
}

const pj = JSON.parse(fs.readFileSync(path.join(root, "plugin.json"), "utf8"));
if (pj.name !== "oh-my-grok") {
  console.error("plugin.json name must be oh-my-grok");
  ok = false;
}

const hooks = JSON.parse(fs.readFileSync(path.join(root, "hooks/hooks.json"), "utf8"));
const events = Object.keys(hooks.hooks || {});
console.log("hooks events:", events.join(", "));
if (!events.includes("Stop") || !events.includes("UserPromptSubmit")) {
  console.error("missing critical hook events");
  ok = false;
}

process.exit(ok ? 0 : 1);
