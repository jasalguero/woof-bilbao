#!/usr/bin/env node
// Sets the staff app version in every place Tauri and npm read it:
//   package.json, package-lock.json, src-tauri/tauri.conf.json,
//   src-tauri/Cargo.toml and the app's entry in src-tauri/Cargo.lock.
//
//   node scripts/bump-version.mjs 0.2.0      (from staff-app/)
//   node scripts/bump-version.mjs --check    prints the versions, fails if they differ
//
// Then commit, merge to the default branch and push a tag `app-v0.2.0`
// (see README "Releases and updates").
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = (p) => join(root, p);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function readJson(p) {
  return JSON.parse(readFileSync(file(p), 'utf8'));
}
function writeJson(p, data) {
  writeFileSync(file(p), JSON.stringify(data, null, 2) + '\n');
}

/** The [package] version and name in Cargo.toml (first `version =` after `[package]`). */
function cargoPackage(text) {
  const section = /^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text);
  if (!section) throw new Error('src-tauri/Cargo.toml has no [package] section');
  const name = /^name\s*=\s*"([^"]+)"/m.exec(section[1])?.[1];
  const version = /^version\s*=\s*"([^"]+)"/m.exec(section[1])?.[1];
  return { name, version, start: section.index, body: section[0] };
}

export function currentVersions() {
  const cargo = cargoPackage(readFileSync(file('src-tauri/Cargo.toml'), 'utf8'));
  return {
    'package.json': readJson('package.json').version,
    'src-tauri/tauri.conf.json': readJson('src-tauri/tauri.conf.json').version,
    'src-tauri/Cargo.toml': cargo.version
  };
}

function bump(version) {
  const pkg = readJson('package.json');
  pkg.version = version;
  writeJson('package.json', pkg);

  try {
    const lock = readJson('package-lock.json');
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    writeJson('package-lock.json', lock);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  const conf = readJson('src-tauri/tauri.conf.json');
  conf.version = version;
  writeJson('src-tauri/tauri.conf.json', conf);

  const tomlPath = file('src-tauri/Cargo.toml');
  const toml = readFileSync(tomlPath, 'utf8');
  const cargo = cargoPackage(toml);
  const body = cargo.body.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
  writeFileSync(tomlPath, toml.slice(0, cargo.start) + body + toml.slice(cargo.start + cargo.body.length));

  // Keep Cargo.lock in step so `cargo check --locked` (CI) passes. The app's
  // own entry needs no download, so --offline works without network.
  const lockPath = file('src-tauri/Cargo.lock');
  try {
    execFileSync('cargo', ['update', '-p', cargo.name, '--offline'], { cwd: file('src-tauri'), stdio: 'inherit' });
  } catch {
    // No cargo on this machine: edit the lock entry directly.
    const lock = readFileSync(lockPath, 'utf8');
    const re = new RegExp(`(\\[\\[package\\]\\]\\nname = "${cargo.name}"\\nversion = )"[^"]+"`);
    if (!re.test(lock)) throw new Error(`could not find ${cargo.name} in Cargo.lock; run \`cargo update -p ${cargo.name}\``);
    writeFileSync(lockPath, lock.replace(re, `$1"${version}"`));
    console.warn('cargo not found: updated Cargo.lock by hand');
  }
}

const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') {
  console.log('usage: node scripts/bump-version.mjs <x.y.z>   |   --check');
  process.exit(arg ? 0 : 1);
}
if (arg === '--check') {
  const v = currentVersions();
  for (const [f, ver] of Object.entries(v)) console.log(`${f}: ${ver}`);
  process.exit(new Set(Object.values(v)).size === 1 ? 0 : 1);
}
const version = arg.replace(/^(?:app-)?v/, '');
if (!SEMVER.test(version)) {
  console.error(`"${arg}" is not a version like 0.2.0`);
  process.exit(1);
}
bump(version);
const after = currentVersions();
for (const [f, ver] of Object.entries(after)) console.log(`${f}: ${ver}`);
console.log(`\nNext: commit ("Release staff app ${version}"), merge to the default branch, then
  git tag app-v${version} <merged commit> && git push origin app-v${version}`);
