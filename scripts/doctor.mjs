#!/usr/bin/env node
/**
 * oh-my-grok doctor — environment / plugin health checks.
 * Usage: node scripts/doctor.mjs  |  npm run doctor
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let errors = 0;
let warnings = 0;

function ok(msg) {
  console.log(`  OK   ${msg}`);
}
function warn(msg) {
  warnings++;
  console.log(`  WARN ${msg}`);
}
function err(msg) {
  errors++;
  console.log(`  ERR  ${msg}`);
}

console.log("oh-my-grok doctor\n");

// System
console.log("[System]");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor >= 20) ok(`node ${process.version}`);
else err(`node ${process.version} (need >= 20)`);

// Package
console.log("\n[Package]");
const pjPath = path.join(root, "package.json");
const pluginPath = path.join(root, "plugin.json");
if (!fs.existsSync(pjPath)) err("package.json missing");
else {
  const pj = JSON.parse(fs.readFileSync(pjPath, "utf8"));
  ok(`package ${pj.name}@${pj.version}`);
}
if (!fs.existsSync(pluginPath)) err("plugin.json missing");
else {
  const plugin = JSON.parse(fs.readFileSync(pluginPath, "utf8"));
  if (plugin.name === "oh-my-grok") ok(`plugin name=${plugin.name} v${plugin.version}`);
  else err(`plugin name is ${plugin.name}, expected oh-my-grok`);
}

// Dist
console.log("\n[Build]");
const cli = path.join(root, "dist", "cli.js");
if (fs.existsSync(cli)) ok("dist/cli.js present");
else err("dist/cli.js missing — run npm run build");

// Hooks
console.log("\n[Hooks]");
const hooksPath = path.join(root, "hooks", "hooks.json");
if (!fs.existsSync(hooksPath)) err("hooks/hooks.json missing");
else {
  const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
  const events = Object.keys(hooks.hooks || {});
  const need = [
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "SubagentStart",
    "SubagentEnd",
    "Stop",
    "SessionEnd",
  ];
  for (const e of need) {
    if (events.includes(e)) ok(`hook ${e}`);
    else err(`missing hook ${e}`);
  }
}

// Agents
console.log("\n[Agents]");
const agentsDir = path.join(root, "agents");
const expectedAgents = [
  "sisyphus",
  "hephaestus",
  "prometheus",
  "atlas",
  "oracle",
  "explore",
  "librarian",
  "metis",
  "momus",
];
if (!fs.existsSync(agentsDir)) err("agents/ missing");
else {
  for (const a of expectedAgents) {
    const f = path.join(agentsDir, `${a}.md`);
    if (fs.existsSync(f)) ok(`agent ${a}`);
    else warn(`agent ${a}.md missing`);
  }
}

// Skills
console.log("\n[Skills]");
const skills = [
  "agent-skill-gate",
  "ralph-loop",
  "ulw-loop",
  "handoff",
  "prometheus-plan",
  "init-deep",
  "hashline-edit",
];
for (const s of skills) {
  const f = path.join(root, "skills", s, "SKILL.md");
  if (fs.existsSync(f)) ok(`skill ${s}`);
  else warn(`skill ${s} missing`);
}
const sp = path.join(root, "vendor", "superpowers", "skills");
if (fs.existsSync(sp)) {
  const n = fs.readdirSync(sp).length;
  ok(`vendor/superpowers skills (${n} entries)`);
} else warn("vendor/superpowers/skills missing — run npm run vendor:superpowers");

// Config sample
console.log("\n[Config]");
const sample = path.join(root, "docs", "config.example.json");
if (fs.existsSync(sample)) ok("docs/config.example.json");
else warn("config.example.json missing");

const cwdCfg = path.join(process.cwd(), ".omg", "config.json");
if (fs.existsSync(cwdCfg)) ok(`workspace config ${cwdCfg}`);
else ok("no workspace .omg/config.json (using env defaults)");

// Dual install hint
console.log("\n[Conflicts]");
ok("Do not dual-enable mihazs/oh-my-grok with this plugin");

// Summary
console.log("\n---");
if (errors === 0 && warnings === 0) {
  console.log("RESULT: healthy");
  process.exit(0);
}
if (errors === 0) {
  console.log(`RESULT: ok with ${warnings} warning(s)`);
  process.exit(0);
}
console.log(`RESULT: ${errors} error(s), ${warnings} warning(s)`);
process.exit(1);
