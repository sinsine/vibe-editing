// Publishes this skill to GitHub through the REST API.
//
// Why not `git push`: on the machine this was built on, github.com:443 is unreachable
// while api.github.com answers normally — so the Git Data API is the working route.
// It also produces ONE clean commit instead of one per file, which the contents API
// would give you.
//
// Flow: create the repo (no auto-init) -> upload every file as a blob -> build one
// tree -> make one root commit -> point refs/heads/main at it.
//
//   node maintainer/publish-github.mjs --repo vibe-editing            # dry run
//   node maintainer/publish-github.mjs --repo vibe-editing --push
//
// Options
//   --owner <login>     defaults to the authenticated gh user
//   --repo <name>       defaults to vibe-editing
//   --description "<>"  repo description
//   --push              actually do it (without this it only lists what would go up)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not url.pathname: this repo may live under a path with non-ASCII
// characters (it does — the folder is 软件工程/skill_vibe_editting), which pathname
// leaves percent-encoded and readdir then cannot find.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const PUSH = process.argv.includes('--push');
const REPO = arg('repo', 'vibe-editing');
const DESCRIPTION = arg('description', '把一段主题说明做成卡点动画解说片，并交付封面、标题与简介 · Turn a topic brief into a beat-locked animated explainer with covers and platform copy');

// Directories that are never published: local scratch, dependency trees, VCS.
const EXCLUDE_DIRS = new Set(['.git', '.migration', 'node_modules', '.hyperframes', 'videos', 'audio', 'data', 'renders', 'covers']);
const EXCLUDE_FILES = new Set(['vibe.config.json', 'sfx-design.mjs', 'cover-copy.json', 'scene-plan.json']);

function gh(args, { input = null, allowFail = false } = {}) {
  const full = [...args];
  if (input) full.push('--input', input);
  try {
    return execFileSync('gh', full, { encoding: 'utf8', maxBuffer: 1 << 28 });
  } catch (e) {
    if (allowFail) return null;
    const msg = `${e.stdout || ''}${e.stderr || ''}`.trim();
    throw new Error(`gh ${args.join(' ')} failed: ${msg || e.message}`);
  }
}

function collect(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      collect(p, r, out);
    } else {
      // these names are per-PROJECT files; only exclude them at the repository ROOT.
      // Excluding by name anywhere silently dropped templates/vibe.config.json,
      // templates/sfx-design.mjs and templates/cover-copy.json — the very files a new
      // project copies — which is why the published templates/ held 7 files, not 10.
      if (rel === '' && EXCLUDE_FILES.has(e.name)) continue;
      if (/\.(raw|tmp|log)$/i.test(e.name)) continue;
      out.push({ path: r, abs: p, bytes: fs.statSync(p).size });
    }
  }
  return out;
}

const who = JSON.parse(gh(['api', 'user']));
const OWNER = arg('owner', who.login);
console.log(`authenticated as ${who.login} (${who.id})\n`);

const files = collect(REPO_ROOT).sort((a, b) => a.path.localeCompare(b.path));
const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
console.log(`${files.length} file(s), ${(totalBytes / 1024).toFixed(0)} KB\n`);
for (const f of files) console.log(`  ${String((f.bytes / 1024).toFixed(1)).padStart(7)} KB  ${f.path}`);
if (!PUSH) {
  console.log(`\ndry run — nothing sent. Re-run with --push to create ${OWNER}/${REPO}.`);
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-publish-'));
const call = (method, endpoint, body) => {
  const f = path.join(tmp, 'body.json');
  fs.writeFileSync(f, JSON.stringify(body));
  const out = gh(['api', '-X', method, endpoint, '--input', f]);
  return out ? JSON.parse(out) : null;
};

// 1. the repository ------------------------------------------------------------
let repo = null;
try { repo = JSON.parse(gh(['api', `repos/${OWNER}/${REPO}`])); } catch { /* not there yet */ }
if (repo) {
  console.log(`\nrepository ${OWNER}/${REPO} already exists`);
} else {
  console.log(`\ncreating ${OWNER}/${REPO} ...`);
  repo = call('POST', 'user/repos', {
    name: REPO,
    description: DESCRIPTION,
    private: false,
    has_issues: true,
    has_wiki: false,
    has_projects: false,
    auto_init: false,        // no seed commit: we create the root commit ourselves
  });
  console.log(`  created: ${repo.html_url}`);
}

// GitHub refuses to create blobs, trees or commits in a repository that has no
// commits at all ("Git Repository is empty", HTTP 409 on git/blobs). So an empty repo
// has to be given one commit through the contents API — which IS allowed to create the
// root commit — before the Git Data API will accept anything. One file, one extra
// commit, and the rest of the tree is layered on top of it.
let baseTree = null;
let seeded = null;
const refExists = () => {
  try { return JSON.parse(gh(['api', `repos/${OWNER}/${REPO}/git/ref/heads/main`])); } catch { return null; }
};
if (!refExists()) {
  const seed = files.find((f) => f.path === 'README.md') || files[0];
  console.log(`\nempty repository — seeding a root commit with ${seed.path} first ...`);
  const seededRes = call('PUT', `repos/${OWNER}/${REPO}/contents/${seed.path}`, {
    message: 'chore: seed the repository so the git data API accepts a tree',
    content: fs.readFileSync(seed.abs).toString('base64'),
  });
  baseTree = seededRes.commit.tree.sha;
  seeded = seed.path;
  console.log(`  seeded ${seed.path} @ ${seededRes.commit.sha.slice(0, 10)}`);
}

// 2. blobs ---------------------------------------------------------------------
console.log('\nuploading blobs ...');
const tree = [];
const toUpload = files.filter((f) => f.path !== seeded);
for (const f of toUpload) {
  const content = fs.readFileSync(f.abs).toString('base64');
  const blob = call('POST', `repos/${OWNER}/${REPO}/git/blobs`, { content, encoding: 'base64' });
  tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  process.stdout.write(`\r  ${tree.length}/${toUpload.length}`);
}
console.log('');

// 3. tree + commit + ref -------------------------------------------------------
console.log('building the tree ...');
const treeBody = baseTree ? { base_tree: baseTree, tree } : { tree };
const treeRes = call('POST', `repos/${OWNER}/${REPO}/git/trees`, treeBody);

const parents = repo.default_branch ? (() => {
  try { return [JSON.parse(gh(['api', `repos/${OWNER}/${REPO}/git/ref/heads/${repo.default_branch}`])).object.sha]; }
  catch { return []; }
})() : [];

const commitBody = {
  message: `feat: vibe-editing — beat-locked explainer skill\n\n主题你定，方法固定：测量音乐 → 网格化时间轴 → 逐帧构建 → 脚本校验 → 成片与发布物料。\n\n包含 SKILL.md、10 篇 references、7 个 templates、24 个可移植脚本（vibe.config.json 驱动）。\n所有数字与阈值来自一次真实交付（161 秒成片：-14.8 LUFS / 真峰值 -1.4 dBTP）。`,
  tree: treeRes.sha,
};
if (parents.length) commitBody.parents = parents;
const commit = call('POST', `repos/${OWNER}/${REPO}/git/commits`, commitBody);
console.log(`  commit ${commit.sha.slice(0, 10)}  (${parents.length ? 'on top of ' + parents[0].slice(0, 10) : 'root commit'})`);

const branch = repo.default_branch || 'main';
if (parents.length) {
  call('PATCH', `repos/${OWNER}/${REPO}/git/refs/heads/${branch}`, { sha: commit.sha, force: true });
} else {
  call('POST', `repos/${OWNER}/${REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
}
try { call('PATCH', `repos/${OWNER}/${REPO}`, { default_branch: branch }); } catch { /* already correct */ }

const final = JSON.parse(gh(['api', `repos/${OWNER}/${REPO}`]));
console.log(`
────────────────────────────────────────────────────────────────
published

  ${final.html_url}
  default branch : ${final.default_branch}
  size           : ${final.size} KB
  visibility     : ${final.visibility}

next: open the repo and check the README renders, then add topics:
  gh api -X PUT repos/${OWNER}/${REPO}/topics -f names[]=video -f names[]=ffmpeg -f names[]=gsap -f names[]=hyperframes -f names[]=agent-skill -f names[]=chinese
────────────────────────────────────────────────────────────────`);
