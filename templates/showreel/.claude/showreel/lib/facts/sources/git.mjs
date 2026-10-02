// Source 5: git — tags (and HEAD / commit count). All of it is commit-dependent, so it goes
// ONLY to build/facts.meta.json, never into the committed facts.json (B5).
import { execFileSync } from 'node:child_process';

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
}

/** {head, commits, tags, latestTag} when hostRoot is a git work-tree top level, else null. */
export function gitMeta(root) {
  try {
    // A hostRoot nested inside another repo must not borrow that repo's history.
    if (git(root, ['rev-parse', '--show-prefix']) !== '') return null;
  } catch {
    return null;
  }
  const tryGit = (args) => {
    try { return git(root, args); } catch { return null; }
  };
  const head = tryGit(['rev-parse', 'HEAD']);
  const commits = head ? Number(tryGit(['rev-list', '--count', 'HEAD'])) : 0;
  const tagList = tryGit(['tag', '--list']);
  const tags = tagList ? tagList.split(/\r?\n/).filter(Boolean).sort() : [];
  const latestTag = head ? tryGit(['describe', '--tags', '--abbrev=0']) : null;
  return { head, commits, tags, latestTag: latestTag || null };
}
