#!/usr/bin/env node
/**
 * Local / documented CI equivalent for oh-my-grok.
 * Same checks as docs/ci.workflow.yml (GitHub Actions template).
 *
 *   npm run ci
 *   node scripts/ci.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmdline) {
  console.log(`\n==> ${label}`);
  // Single-string + shell avoids Windows npm.cmd EINVAL and arg-join deprecation.
  const r = spawnSync(cmdline, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`\nCI failed at: ${label} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

run("build", "npm run build");
run("test", "npm test");
run("doctor", "npm run doctor");
run("validate", "npm run validate");
console.log("\nCI OK — build + test + doctor + validate");
