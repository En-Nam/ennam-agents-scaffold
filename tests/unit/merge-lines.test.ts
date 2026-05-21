import { describe, it, expect } from 'vitest';
import { mergeLines } from '../../packages/cli/src/merge/lines.js';

describe('mergeLines', () => {
  it('appends missing lines, skips duplicates', () => {
    const user = 'node_modules\ndist\n';
    const incoming = '# scaffold additions\n.cache/\nnode_modules\n.env.local\n';
    const result = mergeLines(user, incoming);
    expect(result).toBe('node_modules\ndist\n# scaffold additions\n.cache/\n.env.local\n');
  });

  it('returns user content unchanged if all incoming lines already present', () => {
    const user = 'a\nb\nc\n';
    const incoming = 'a\nb\n';
    expect(mergeLines(user, incoming)).toBe('a\nb\nc\n');
  });

  it('creates file content when user is empty', () => {
    expect(mergeLines('', 'a\nb\n')).toBe('a\nb\n');
  });

  it('trims trailing whitespace for dedup comparison', () => {
    const user = 'a  \n';
    const incoming = 'a\n';
    expect(mergeLines(user, incoming)).toBe('a  \n');  // user line preserved
  });

  it('treats blank lines as duplicatable (skipped if already a blank line at end)', () => {
    const user = 'a\n\nb\n';
    const incoming = 'a\nb\n';
    const result = mergeLines(user, incoming);
    expect(result).toBe('a\n\nb\n');  // already present, no change
  });

  it('idempotent', () => {
    const user = 'a\n';
    const incoming = 'b\nc\n';
    const once = mergeLines(user, incoming);
    const twice = mergeLines(once, incoming);
    expect(twice).toBe(once);
  });

  it('handles missing trailing newline on user', () => {
    const user = 'a';
    const incoming = 'b\n';
    expect(mergeLines(user, incoming)).toBe('a\nb\n');
  });
});
