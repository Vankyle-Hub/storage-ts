#!/usr/bin/env node
/**
 * Publishes all workspace packages to npmjs.com under the @vankyle scope.
 *
 * GitHub Packages requires packages to use @vankyle-hub (matching the GitHub
 * owner), but on npmjs.com the desired scope is @vankyle. This script
 * temporarily rewrites each package.json — changing the scope and resolving
 * workspace:* dependencies to concrete versions — then runs `npm publish`.
 */

import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const PACKAGES_DIR = "packages";
const SCOPE_FROM = "@vankyle-hub/";
const SCOPE_TO = "@vankyle/";

/**
 * Rewrites every .js and .d.ts file under `dist/` for the given package
 * directory, replacing SCOPE_FROM with SCOPE_TO in import/require strings.
 * Returns an array of { path, original } objects so callers can restore them.
 *
 * @param {string} dir  package directory name (relative to PACKAGES_DIR)
 * @returns {{ path: string; original: string }[]}
 */
function rewriteDistFiles(dir) {
  const distDir = join(PACKAGES_DIR, dir, "dist");
  if (!existsSync(distDir)) return [];

  /** @type {{ path: string; original: string }[]} */
  const backed = [];

  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts")) {
        const original = readFileSync(full, "utf8");
        if (original.includes(SCOPE_FROM)) {
          writeFileSync(full, original.replaceAll(SCOPE_FROM, SCOPE_TO));
          backed.push({ path: full, original });
        }
      }
    }
  }

  walk(distDir);
  return backed;
}

// ---------------------------------------------------------------------------
// 1. Collect the version of every workspace package so we can resolve
//    workspace:* references when rewriting dependencies.
// ---------------------------------------------------------------------------
const allDirs = readdirSync(PACKAGES_DIR).filter((d) =>
  existsSync(join(PACKAGES_DIR, d, "package.json")),
);

/** @type {Map<string, string>} original package name → version */
const versions = new Map();
/** @type {Map<string, string>} original package name → directory name */
const dirByName = new Map();
for (const dir of allDirs) {
  const pkg = JSON.parse(
    readFileSync(join(PACKAGES_DIR, dir, "package.json"), "utf8"),
  );
  versions.set(pkg.name, pkg.version);
  dirByName.set(pkg.name, dir);
}

// Topological sort: publish packages without internal deps first.
function topoSort(dirs) {
  const visited = new Set();
  const sorted = [];
  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    const dir = dirByName.get(name);
    const pkg = JSON.parse(
      readFileSync(join(PACKAGES_DIR, dir, "package.json"), "utf8"),
    );
    for (const depType of ["dependencies", "peerDependencies"]) {
      if (!pkg[depType]) continue;
      for (const dep of Object.keys(pkg[depType])) {
        if (dirByName.has(dep)) visit(dep);
      }
    }
    sorted.push(dir);
  }
  for (const name of dirByName.keys()) visit(name);
  return sorted;
}

const packageDirs = topoSort(allDirs);
console.log(`Publish order: ${packageDirs.join(", ")}\n`);

// ---------------------------------------------------------------------------
// 2. For each package: back up → rewrite → publish → restore.
// ---------------------------------------------------------------------------
const errors = [];

for (const dir of packageDirs) {
  const pkgPath = join(PACKAGES_DIR, dir, "package.json");
  const backupPath = pkgPath + ".bak";

  copyFileSync(pkgPath, backupPath);

  /** @type {{ path: string; original: string }[]} */
  let distBackups = [];

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

    // Rename package scope
    pkg.name = pkg.name.replace(SCOPE_FROM, SCOPE_TO);

    // Rewrite internal dependencies
    for (const depType of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
    ]) {
      if (!pkg[depType]) continue;
      const rewritten = {};
      for (const [name, version] of Object.entries(pkg[depType])) {
        const newName = name.startsWith(SCOPE_FROM)
          ? name.replace(SCOPE_FROM, SCOPE_TO)
          : name;
        const newVersion = version.startsWith("workspace:")
          ? (versions.get(name) ?? pkg.version)
          : version;
        rewritten[newName] = newVersion;
      }
      pkg[depType] = rewritten;
    }

    // Ensure public access
    pkg.publishConfig = { access: "public" };

    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

    // Rewrite @vankyle-hub/ → @vankyle/ in compiled dist files so that the
    // published package resolves its imports against the npm scope, not the
    // GitHub Packages scope stored in the source files.
    distBackups = rewriteDistFiles(dir);

    console.log(`Publishing ${pkg.name}@${pkg.version} …`);
    execSync("npm publish --access public", {
      cwd: join(PACKAGES_DIR, dir),
      stdio: "inherit",
    });
    console.log(`✓ ${pkg.name}@${pkg.version}`);
  } catch (err) {
    console.error(`✗ Failed to publish ${dir}: ${err.message}`);
    errors.push(dir);
  } finally {
    // Always restore the original package.json and any rewritten dist files.
    renameSync(backupPath, pkgPath);
    for (const { path, original } of distBackups) {
      writeFileSync(path, original);
    }
  }
}

if (errors.length > 0) {
  console.error(`\nFailed packages: ${errors.join(", ")}`);
  process.exit(1);
}
