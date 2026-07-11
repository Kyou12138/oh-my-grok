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
  "agents/metis.md",
  "agents/momus.md",
  "skills/agent-skill-gate/SKILL.md",
  "skills/init-deep/SKILL.md",
  "rules/00-sisyphus.md",
  "scripts/doctor.mjs",
  "scripts/ci.mjs",
  "LICENSE",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "docs/ci.workflow.yml",
  "README.md",
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
if (!String(pj.homepage || "").includes("Kyou12138/oh-my-grok")) {
  console.error("plugin.json homepage must point at github.com/Kyou12138/oh-my-grok");
  ok = false;
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const repoUrl = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url || "";
if (!repoUrl.includes("Kyou12138/oh-my-grok")) {
  console.error("package.json repository must be Kyou12138/oh-my-grok");
  ok = false;
}
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
if (!readme.includes("grok plugin install github.com/Kyou12138/oh-my-grok --trust")) {
  console.error("README missing documented GitHub install command");
  ok = false;
}
if (!/ultrawork/i.test(readme)) {
  console.error("README missing ultrawork wow path");
  ok = false;
}
if (!fs.existsSync(path.join(root, "README.en.md"))) {
  console.error("README.en.md missing (English edition)");
  ok = false;
} else {
  console.log("OK", "README.en.md");
}
if (/tests-vitest-0A7-blue/.test(readme)) {
  console.error("README has broken shields color tests-vitest-0A7-blue");
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
