// Checks that every file the documentation points at actually exists.
//
// The docs were written by several passes in parallel, so a renamed or never-created
// script can survive as a plausible-looking reference — exactly the failure this skill
// warns about elsewhere ("a gate that never gated"). This resolves every backticked
// path in every markdown file against the tree.
//
//   node maintainer/check-links.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.migration'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const all = walk(ROOT);
const rel = new Set(all.map((p) => path.relative(ROOT, p).replace(/\\/g, '/')));
// a project-relative form of the same files: docs say `tools/x.mjs` because that is
// where init-project puts them, while the repo keeps them in `scripts/`
const asProjectRel = new Set([...rel].map((r) => r.replace(/^scripts\//, 'tools/')));

const md = all.filter((p) => /\.md$/i.test(p));
const PATTERNS = [
  /`(references\/[A-Za-z0-9._\-\/]+\.md)`/g,
  /`(templates\/[A-Za-z0-9._\-\/]+)`/g,
  /`(scripts\/[A-Za-z0-9._\-\/]+)`/g,
  /`(tools\/[A-Za-z0-9._\-\/]+\.mjs)`/g,
  /`(maintainer\/[A-Za-z0-9._\-\/]+)`/g,
  /`(SKILL\.md)`/g,
  /`((?:videos|audio|data)\/[A-Za-z0-9._\-\/<>\u4e00-\u9fff]+)`/g,
];

const missing = [];
const checked = new Set();

// audio/, data/, videos/, covers/, renders/ are things the pipeline WRITES into a
// user's project. This repository has no project, so those paths legitimately do not
// resolve here — they are outputs, not sources, and must not be reported as drift.
const PROJECT_OUTPUT_PREFIXES = ['audio/', 'data/', 'videos/', 'covers/', 'renders/'];
const isProjectOutput = (t) => PROJECT_OUTPUT_PREFIXES.some((p) => t.startsWith(p));

for (const f of md) {
  const src = fs.readFileSync(f, 'utf8');
  for (const re of PATTERNS) {
    for (const m of src.matchAll(re)) {
      const target = m[1];
      if (target.includes('<') || target.includes('*')) continue;   // a placeholder, not a path
      if (isProjectOutput(target)) continue;
      checked.add(target);
      const ok = rel.has(target) || asProjectRel.has(target);
      if (!ok) missing.push({ doc: path.relative(ROOT, f).replace(/\\/g, '/'), target });
    }
  }
}

console.log(`checked ${checked.size} source path reference(s) across ${md.length} markdown file(s)`);
console.log('(paths under audio/ data/ videos/ covers/ renders/ are project outputs, not counted)\n');
if (!missing.length) {
  console.log('every referenced path resolves');
} else {
  const byTarget = new Map();
  for (const m of missing) {
    if (!byTarget.has(m.target)) byTarget.set(m.target, []);
    byTarget.get(m.target).push(m.doc);
  }
  console.log(`${byTarget.size} unresolved target(s):`);
  for (const [t, docs] of [...byTarget].sort()) console.log(`  ${t}\n      cited by: ${[...new Set(docs)].join(', ')}`);
}

// also report the inventory so drift is visible
const count = (p) => [...rel].filter((r) => r.startsWith(p)).length;
console.log(`
inventory
  SKILL.md        ${rel.has('SKILL.md') ? 'present' : 'MISSING'}
  README.md       ${rel.has('README.md') ? 'present' : 'MISSING'}
  references/     ${count('references/')} file(s)
  templates/      ${count('templates/')} file(s)
  scripts/        ${count('scripts/')} file(s)
  maintainer/     ${count('maintainer/')} file(s)`);

process.exit(missing.length ? 1 : 0);

