#!/usr/bin/env node
/**
 * Vendor obra/superpowers skills into vendor/superpowers/skills
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const vendor = path.join(root, "vendor", "superpowers");
const tmp = path.join(root, "vendor", ".superpowers-tmp");

const REPO = process.env.SUPERPOWERS_REPO || "https://github.com/obra/superpowers.git";
const REF = process.env.SUPERPOWERS_REF || "main";

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copySkills(srcSkills, destSkills) {
  fs.mkdirSync(destSkills, { recursive: true });
  for (const name of fs.readdirSync(srcSkills)) {
    const from = path.join(srcSkills, name);
    const to = path.join(destSkills, name);
    if (fs.statSync(from).isDirectory()) {
      fs.cpSync(from, to, { recursive: true });
    }
  }
}

console.log(`[vendor:superpowers] cloning ${REPO} @ ${REF}`);
rm(tmp);
try {
  execSync(`git clone --depth 1 --branch ${REF} ${REPO} "${tmp}"`, {
    stdio: "inherit",
    shell: true,
  });
} catch {
  // branch might not work with --branch on some remotes; try default then checkout
  execSync(`git clone --depth 1 ${REPO} "${tmp}"`, { stdio: "inherit", shell: true });
}

const skillsSrc = path.join(tmp, "skills");
if (!fs.existsSync(skillsSrc)) {
  console.error("No skills/ in superpowers clone");
  process.exit(1);
}

rm(vendor);
fs.mkdirSync(vendor, { recursive: true });
copySkills(skillsSrc, path.join(vendor, "skills"));

// pin info
fs.writeFileSync(
  path.join(vendor, "VENDOR.json"),
  JSON.stringify(
    {
      repo: REPO,
      ref: REF,
      vendoredAt: new Date().toISOString(),
      note: "MIT obra/superpowers — do not edit vendored skills by hand; re-run npm run vendor:superpowers",
    },
    null,
    2,
  ) + "\n",
);

rm(tmp);
const count = fs.readdirSync(path.join(vendor, "skills")).length;
console.log(`[vendor:superpowers] done — ${count} skill dirs`);
