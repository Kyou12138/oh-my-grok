#!/usr/bin/env node
/**
 * Local / documented CI equivalent for oh-my-grok.
 * Same checks as .github/workflows/ci.yml (when that file is enabled on GitHub).
 *
 *   npm run ci
 *   node scripts/ci.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(label, args) {
  console.log(`\n==> ${label}`);
  const r = spawnSync(npmCmd, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`\nCI failed at: ${label} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

run("build", ["run", "build"]);
run("test", ["test"]);
run("doctor", ["run", "doctor"]);
run("validate", ["run", "validate"]);
console.log("\nCI OK — build + test + doctor + validate");
