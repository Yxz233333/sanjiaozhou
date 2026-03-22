#!/usr/bin/env node
/**
 * Pushes changed local files to GitHub using the Git Data API.
 * Only uploads files that differ from what's already on GitHub.
 * Uses GITHUB_TOKEN env var. Run: node script/github-push.mjs [commit message]
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

const OWNER = 'Yxz233333';
const REPO = 'sanjiaozhou';
const BRANCH = 'main';
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error('GITHUB_TOKEN env var is not set');
  process.exit(1);
}

const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
const headers = {
  Authorization: `token ${TOKEN}`,
  'Content-Type': 'application/json',
  Accept: 'application/vnd.github+json',
};

// Files/dirs to skip when pushing
const IGNORE = new Set([
  'node_modules', '.git', 'dist', '.local', 'attached_assets',
  '.cache', '.config', '.npm', '.upm', 'test-ping.txt',
]);

// Compute git blob SHA (same algorithm git uses internally)
function gitBlobSha(content) {
  const header = `blob ${content.length}\0`;
  const hash = createHash('sha1');
  hash.update(header, 'binary');
  hash.update(content);
  return hash.digest('hex');
}

function getAllFiles(dir, root = dir) {
  const results = [];
  for (const name of readdirSync(dir)) {
    if (IGNORE.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    const rel = relative(root, full).replace(/\\/g, '/');
    try {
      if (statSync(full).isDirectory()) {
        results.push(...getAllFiles(full, root));
      } else {
        results.push(rel);
      }
    } catch { /* skip unreadable */ }
  }
  return results;
}

async function api(path, method = 'GET', body) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Fetch the full recursive tree from GitHub
async function getRemoteTree(treeSha) {
  const result = await api(`/git/trees/${treeSha}?recursive=1`);
  const map = {};
  for (const item of result.tree) {
    if (item.type === 'blob') {
      map[item.path] = item.sha;
    }
  }
  return map;
}

async function main() {
  const commitMsg = process.argv[2] || `Update from Replit [${new Date().toISOString()}]`;

  console.log('Fetching current branch state...');
  const ref = await api(`/git/ref/heads/${BRANCH}`);
  const latestCommitSha = ref.object.sha;

  const commit = await api(`/git/commits/${latestCommitSha}`);
  const baseTreeSha = commit.tree.sha;

  console.log('Fetching remote file tree...');
  const remoteTree = await getRemoteTree(baseTreeSha);

  const root = process.cwd();
  const localFiles = getAllFiles(root);

  // Find changed/new files
  const changed = [];
  for (const rel of localFiles) {
    const full = join(root, rel);
    let content;
    try {
      content = readFileSync(full);
    } catch { continue; }

    const localSha = gitBlobSha(content);
    if (remoteTree[rel] !== localSha) {
      changed.push({ rel, full, content });
    }
  }

  if (changed.length === 0) {
    console.log('No changes detected. GitHub is already up to date.');
    return;
  }

  console.log(`Uploading ${changed.length} changed file(s):`);
  changed.forEach(f => console.log(`  + ${f.rel}`));

  const treeItems = [];
  for (const { rel, content } of changed) {
    const isBinary = content.includes(0);
    const blob = await api('/git/blobs', 'POST', {
      content: isBinary ? content.toString('base64') : content.toString('utf8'),
      encoding: isBinary ? 'base64' : 'utf-8',
    });
    treeItems.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
    process.stdout.write(`  uploaded: ${rel}\n`);
  }

  console.log('Creating tree...');
  const newTree = await api('/git/trees', 'POST', {
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  console.log('Creating commit...');
  const newCommit = await api('/git/commits', 'POST', {
    message: commitMsg,
    tree: newTree.sha,
    parents: [latestCommitSha],
  });

  console.log('Updating branch...');
  await api(`/git/refs/heads/${BRANCH}`, 'PATCH', {
    sha: newCommit.sha,
    force: false,
  });

  console.log(`\nDone! Pushed ${changed.length} file(s) as commit ${newCommit.sha.slice(0, 7)}`);
  console.log(`GitHub Actions will now build and deploy to sanjiaozhou.zmh.icu automatically.`);
}

main().catch(err => {
  console.error('\nPush failed:', err.message);
  process.exit(1);
});
