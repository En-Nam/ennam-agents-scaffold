import { describe, it, expect } from 'vitest';
import { mergeMarker } from '../../packages/cli/src/merge/marker.js';

const BEGIN = '<!-- ennam-agents-scaffold:begin v1.0.0-rc.0 -->';
const END = '<!-- ennam-agents-scaffold:end -->';
const BLOCK = `${BEGIN}\nNEW BLOCK\n${END}`;

describe('mergeMarker', () => {
  it('appends block at end if existing has no markers', () => {
    const existing = '# Project\n\nuser content\n';
    const result = mergeMarker(existing, BLOCK);
    expect(result).toBe(`# Project\n\nuser content\n\n${BLOCK}\n`);
  });

  it('replaces existing block in place, preserving surrounding text', () => {
    const existing = `# Project\n\n${BEGIN}\nOLD BLOCK\n${END}\n\n## My Notes\n`;
    const result = mergeMarker(existing, BLOCK);
    expect(result).toBe(`# Project\n\n${BLOCK}\n\n## My Notes\n`);
  });

  it('replaces block regardless of version in begin marker', () => {
    const oldVersionBegin = '<!-- ennam-agents-scaffold:begin v0.1.0-mvp -->';
    const existing = `# P\n${oldVersionBegin}\nOLD\n${END}\n`;
    const result = mergeMarker(existing, BLOCK);
    expect(result).toContain('NEW BLOCK');
    expect(result).not.toContain('OLD');
  });

  it('idempotent: applying same block twice yields same result', () => {
    const existing = '# P\nuser\n';
    const once = mergeMarker(existing, BLOCK);
    const twice = mergeMarker(once, BLOCK);
    expect(twice).toBe(once);
  });

  it('creates file (empty existing) by emitting block alone', () => {
    const result = mergeMarker('', BLOCK);
    expect(result).toBe(`${BLOCK}\n`);
  });

  it('handles existing file without trailing newline', () => {
    const existing = '# P\nuser';  // no \n at end
    const result = mergeMarker(existing, BLOCK);
    expect(result).toBe(`# P\nuser\n\n${BLOCK}\n`);
  });

  it('throws on malformed input — begin without matching end', () => {
    const malformed = `# P\n${BEGIN}\nUNCLOSED\n`;
    expect(() => mergeMarker(malformed, BLOCK)).toThrow(/marker.*malformed|end.*not found/i);
  });
});
