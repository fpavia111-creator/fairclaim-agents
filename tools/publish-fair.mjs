#!/usr/bin/env node
// Publishes every Fair Agents package to npm, once, in dependency order.
//
//   node publish-fair.mjs --clone  <folder>        clone the 18 repositories into <folder> (default branches)
//   node publish-fair.mjs          <folder>        dry run: checks everything, prints the plan, publishes nothing
//   node publish-fair.mjs --go     <folder>        publish (asks you to type PUBLISH first)
//   node publish-fair.mjs --verify <folder>        after publishing: every package on npm matches the local tarball
//
// Options: --user <npm user> (default kurtfrancisco)  --registry <url> (default https://registry.npmjs.org/)
//          --pause <ms> between publishes (default 2500)  --only <name,name>  --tests (run npm test in each repo first)
//
// Safe to run again: a name@version already on the registry with the same tarball is skipped; one with a
// DIFFERENT tarball stops the run (that is the collision this script exists to prevent).
// Zero dependencies. Node 20+. Works on Windows, macOS and Linux.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

const REPOS = ['fairbooks', 'fairhaul', 'fairclaim', 'fairlease', 'fairstay', 'fairpractice', 'fairpractice2', 'fairwire', 'fairbrief',
  'fairpolicy', 'fairgive', 'fairshop', 'fairmake', 'fairbuild', 'fairtable', 'fairroom', 'fairdrive', 'fairclinic'].map((r) => `${r}-agents`);
// Shared packages carried by several repositories, and the repository that is their home.
const HOME = { 'fair-agent-core': 'fairbooks-agents', 'fairclaim-core': 'fairclaim-agents', 'fairpractice-core': 'fairpractice-agents' };
const MIN = { 'fair-agent-core': '8.0.0', 'fairclaim-core': '0.3.0', 'fairpractice-core': '0.3.0' };

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const valued = new Set(['--user', '--registry', '--pause', '--only']);
const root = resolve(argv.find((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1])) || '.');
const registry = opt('--registry', 'https://registry.npmjs.org/');
const user = opt('--user', 'kurtfrancisco');
const pause = Number(opt('--pause', '2500'));
const only = opt('--only', '') ? new Set(opt('--only').split(',')) : null;
const isWin = process.platform === 'win32';
const logFile = join(root, 'publish-log.jsonl');

function run(cmd, args, cwd, { allowFail = false, input } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: isWin, input, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, npm_config_registry: registry } });
  if (r.status !== 0 && !allowFail) { console.error(`\n${cmd} ${args.join(' ')} failed in ${cwd}\n${r.stdout}\n${r.stderr}`); process.exit(1); }
  return r;
}
const npm = (args, cwd, o) => run('npm', args, cwd, o);
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cmpVer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

if (flag('--clone')) {
  mkdirSync(root, { recursive: true });
  for (const r of REPOS) {
    if (existsSync(join(root, r))) { say(`have   ${r}`); continue; }
    run('git', ['clone', '--quiet', `https://github.com/fpavia111-creator/${r}.git`, r], root); say(`cloned ${r}`);
  }
  say(`\nNext: node publish-fair.mjs "${root}"   (dry run)`); process.exit(0);
}

// 1. The repositories: present, clean, on their default branch and up to date.
say(`Fair Agents npm publish  ${flag('--go') ? '(PUBLISHING)' : flag('--verify') ? '(verify)' : '(dry run: nothing is published)'}\nfolder ${root}\nregistry ${registry}\n`);
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 20) { console.error('Node 20 or newer is needed.'); process.exit(1); }
for (const r of REPOS) {
  const d = join(root, r);
  if (!existsSync(join(d, 'package.json'))) { console.error(`Missing ${d}. Run: node publish-fair.mjs --clone "${root}"`); process.exit(1); }
  if (run('git', ['status', '--porcelain'], d).stdout.trim()) { console.error(`${r} has uncommitted changes. Commit or discard them first.`); process.exit(1); }
  run('git', ['pull', '--ff-only', '--quiet'], d, { allowFail: true });
  if (!existsSync(join(d, 'node_modules'))) npm(['install', '--ignore-scripts', '--no-audit', '--no-fund'], d);
}

// 2. Every workspace package of every repository, with its tarball.
const copies = new Map(); // name@version -> [{ repo, dir, shasum, pkg }]
for (const r of REPOS) {
  const d = join(root, r);
  const ws = JSON.parse(npm(['query', '.workspace'], d).stdout);
  const packs = JSON.parse(npm(['pack', '--dry-run', '--json', '--workspaces', '--ignore-scripts'], d).stdout);
  const sha = new Map(packs.map((p) => [`${p.name}@${p.version}`, p]));
  for (const w of ws) {
    if (w.private) continue;
    const key = `${w.name}@${w.version}`; const p = sha.get(key);
    if (!p) { console.error(`No tarball for ${key} in ${r}`); process.exit(1); }
    const bad = p.files.map((f) => f.path).filter((f) => /(^|\/)(node_modules|\.git|\.[a-z]+-state)\/|\.npmrc$|\.tgz$|(^|\/)\.env$/.test(f));
    if (bad.length) { console.error(`${key} in ${r} would ship ${bad.join(', ')}`); process.exit(1); }
    if (!copies.has(key)) copies.set(key, []);
    copies.get(key).push({ repo: r, dir: join(d, w.location), shasum: p.shasum, pkg: JSON.parse(readFileSync(join(d, w.location, 'package.json'), 'utf8')) });
  }
}

// 3. One name, one set of files. Shared cores must be at least the canonical version.
let problems = 0; const byName = new Map();
for (const [key, list] of copies) {
  const name = list[0].pkg.name;
  if (byName.has(name)) { console.error(`${name} has two versions across the repositories: ${byName.get(name)} and ${key}`); problems++; }
  byName.set(name, key);
  if (new Set(list.map((c) => c.shasum)).size > 1) { console.error(`${key}: ${list.length} copies with DIFFERENT files (${list.map((c) => c.repo).join(', ')})`); problems++; }
  if (MIN[name] && cmpVer(list[0].pkg.version, MIN[name]) < 0) { console.error(`${key} is older than ${MIN[name]}: merge the "npm-ready-cores" pull requests first.`); problems++; }
  const home = HOME[name]; if (home && !list.some((c) => c.repo === home)) { console.error(`${key} is not in its home repository ${home}`); problems++; }
  const hp = list[0].pkg.homepage || '';
  if (/github\.com\/fpavia111-creator\/fair(?!claim|give|haul|shop)[a-z0-9]*-agents\/tree\/main\//.test(hp)) { console.error(`${key}: homepage points at tree/main but that repository's branch is master; merge the "fix-default-branch-links" pull requests first.`); problems++; }
}
if (problems) { console.error(`\n${problems} problem(s). Nothing was published.`); process.exit(1); }

// 4. Order: a package goes after every package it depends on.
const plan = []; const placed = new Set(); const pending = new Map([...copies].map(([k, l]) => [k, l.find((c) => c.repo === HOME[c.pkg.name]) || l[0]]));
while (pending.size) {
  let moved = false;
  for (const [key, c] of pending) {
    const deps = Object.keys({ ...c.pkg.dependencies, ...c.pkg.peerDependencies }).filter((n) => byName.has(n));
    if (deps.every((n) => placed.has(n))) { plan.push(c); placed.add(c.pkg.name); pending.delete(key); moved = true; }
  }
  if (!moved) { console.error('Dependency cycle among: ' + [...pending.keys()].join(', ')); process.exit(1); }
}
const selected = only ? plan.filter((c) => only.has(c.pkg.name)) : plan;
const cores = plan.filter((c) => plan.some((o) => o !== c && Object.keys(o.pkg.dependencies || {}).includes(c.pkg.name)));
say(`${plan.length} packages from ${REPOS.length} repositories (${[...copies.values()].reduce((n, l) => n + l.length, 0)} copies; shared ones checked identical).`);
say(`Published first, in this order: ${cores.map((c) => `${c.pkg.name}@${c.pkg.version}`).join(', ')}.`);

// 5. What is on the registry already.
async function onRegistry(name, version) {
  const r = await fetch(new URL(encodeURIComponent(name).replace('%40', '@'), registry), { headers: { accept: 'application/vnd.npm.install-v1+json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`registry answered ${r.status} for ${name}`);
  const doc = await r.json(); const v = doc.versions && doc.versions[version];
  return { taken: true, shasum: v ? v.dist.shasum : null, versions: Object.keys(doc.versions || {}) };
}
const state = new Map();
for (let i = 0; i < selected.length; i += 16) {
  await Promise.all(selected.slice(i, i + 16).map(async (c) => state.set(c, await onRegistry(c.pkg.name, c.pkg.version))));
}
const already = selected.filter((c) => state.get(c) && state.get(c).shasum === c.shasum);
const clash = selected.filter((c) => state.get(c) && state.get(c).shasum && state.get(c).shasum !== c.shasum);
const foreign = selected.filter((c) => state.get(c) && !state.get(c).shasum);
const todo = selected.filter((c) => !state.get(c));
say(`On the registry already, same files: ${already.length}. To publish: ${todo.length + foreign.length}.`);
if (clash.length) { console.error(`STOP: on the registry with different files: ${clash.map((c) => `${c.pkg.name}@${c.pkg.version}`).join(', ')}. Bump these versions.`); process.exit(1); }
if (foreign.length) say(`Name exists with other versions (needs you as a maintainer): ${foreign.map((c) => `${c.pkg.name} [${state.get(c).versions.slice(-3).join(', ')}]`).join(', ')}`);

if (flag('--verify')) {
  const missing = selected.filter((c) => !(state.get(c) && state.get(c).shasum === c.shasum));
  say(missing.length ? `NOT on the registry or different: ${missing.map((c) => c.pkg.name).join(', ')}` : `All ${selected.length} packages are on ${registry} with the same files as GitHub.`);
  process.exit(missing.length ? 1 : 0);
}
if (!flag('--go')) {
  say('\nDry run finished. Every check passed. To publish:  node publish-fair.mjs --go "' + root + '"');
  process.exit(0);
}

// 6. Publish.
const who = npm(['whoami'], root, { allowFail: true });
if (who.status !== 0) { console.error('Not logged in to npm. Run "npm login" (see the plan for the token option), then run this again.'); process.exit(1); }
if (who.stdout.trim() !== user) { console.error(`Logged in to npm as "${who.stdout.trim()}", expected "${user}". Use --user if that is right.`); process.exit(1); }
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(`\nPublish ${todo.length + foreign.length} packages to ${registry} as ${user}? npm does not let you take a version back after 72 hours, and a name@version can never be reused. Type PUBLISH to go: `);
rl.close();
if (answer.trim() !== 'PUBLISH') { say('Stopped. Nothing was published.'); process.exit(0); }

let done = 0; const failed = [];
for (const c of [...todo, ...foreign]) {
  const id = `${c.pkg.name}@${c.pkg.version}`;
  let ok = false;
  for (let attempt = 1; attempt <= 6 && !ok; attempt++) {
    const r = npm(['publish', '--access', 'public', '--ignore-scripts'], c.dir, { allowFail: true });
    const out = `${r.stdout}\n${r.stderr}`;
    if (r.status === 0 || /cannot publish over|previously published/i.test(out)) ok = true;
    else if (/E429|Too Many Requests|rate limit/i.test(out)) { const wait = 30000 * attempt; say(`  rate limited, waiting ${wait / 1000}s`); await sleep(wait); }
    else if (/EOTP|one-time password/i.test(out)) { console.error(`\nnpm wants a one-time password for ${id}. Use the token route in the plan, then run this again (published packages are skipped).`); process.exit(1); }
    else { failed.push({ id, error: out.split('\n').filter((l) => /npm error|ERR!/.test(l)).slice(0, 4).join(' | ') }); break; }
  }
  appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), id, repo: c.repo, ok }) + '\n');
  if (ok) { done++; say(`  ${String(done).padStart(3)}  ${id}`); }
  else { say(`  FAIL ${id}`); if (cores.includes(c)) { console.error(`${id} is needed by other packages, so the run stops here.`); break; } }
  await sleep(pause);
}
say(`\nPublished ${done}. Failed ${failed.length}.${failed.length ? '\n' + failed.map((f) => `  ${f.id}: ${f.error}`).join('\n') : ''}\nLog: ${logFile}\nThen: node publish-fair.mjs --verify "${root}"`);
process.exit(failed.length ? 1 : 0);
