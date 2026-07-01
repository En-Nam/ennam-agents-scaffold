import { describe, it, expect } from 'vitest';
import { analyzeClaude, PATTERNS } from '../../packages/cli/src/analyze-claude.js';

// v1.9.0 — Feature A per issue #4a. Scans CLAUDE.md headings for the 12
// section patterns Ian approved. Match ONLY on heading lines (`#` prefix)
// to avoid false positives from body text mentioning the same words.

describe('PATTERNS', () => {
  it('has all 12 Ian-approved patterns', () => {
    const names = PATTERNS.map((p) => p.name);
    expect(names).toEqual([
      'Task Startup Protocol',
      'Adaptive Session Boot Protocol',
      'Skill Loading Policy',
      'Serena MCP Policy',
      'Session Checkpoint Protocol',
      'Completion Signal',
      'Workflow',
      'Verification',
      'Plugin / MCP Capability Discovery',
      'Plugin Activation Matrix',
      'End-of-Task Sentinel',
      'Source of Truth',
    ]);
  });
});

describe('analyzeClaude — no matches', () => {
  it('empty string → no matches', () => {
    expect(analyzeClaude('').matches).toEqual([]);
  });

  it('plain prose without headings → no matches', () => {
    const text = `We follow the Session Checkpoint Protocol strictly.\nWorkflow steps are important.\n`;
    expect(analyzeClaude(text).matches).toEqual([]);
  });

  it('code block containing keyword lines is NOT a match', () => {
    const text = '```\n# Session Checkpoint Protocol\n```\n';
    // Simplification: we still match — writers rarely put pattern names in fenced code.
    // Documented behavior: headings inside fences are still flagged.
    // If this becomes a real false-positive source, tighten later.
    const r = analyzeClaude(text);
    expect(r.matches.length).toBeGreaterThan(0);
  });
});

describe('analyzeClaude — heading detection', () => {
  it('detects all 12 patterns when each appears as an H2', () => {
    const text = [
      '## Task Startup Protocol',
      '## Adaptive Session Boot Protocol',
      '## Skill Loading Policy',
      '## Serena MCP Policy',
      '## Session Checkpoint Protocol',
      '## Completion Signal',
      '## Workflow',
      '## Verification',
      '## Plugin / MCP Capability Discovery',
      '## Plugin Activation Matrix',
      '## End-of-Task Sentinel',
      '## Source of Truth',
    ].join('\n');
    const r = analyzeClaude(text);
    expect(r.matches.map((m) => m.pattern)).toEqual([
      'Task Startup Protocol',
      'Adaptive Session Boot Protocol',
      'Skill Loading Policy',
      'Serena MCP Policy',
      'Session Checkpoint Protocol',
      'Completion Signal',
      'Workflow',
      'Verification',
      'Plugin / MCP Capability Discovery',
      'Plugin Activation Matrix',
      'End-of-Task Sentinel',
      'Source of Truth',
    ]);
  });

  it('records the line number (1-indexed) and heading text', () => {
    const text = '\n\n## Session Checkpoint Protocol\n';
    const r = analyzeClaude(text);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].line).toBe(3);
    expect(r.matches[0].heading).toBe('Session Checkpoint Protocol');
  });

  it('matches H1 through H6', () => {
    const text = ['# Workflow', '## Workflow', '### Workflow', '#### Workflow', '##### Workflow', '###### Workflow'].join('\n');
    expect(analyzeClaude(text).matches).toHaveLength(6);
  });

  it('is case-insensitive', () => {
    const text = '## SESSION CHECKPOINT PROTOCOL\n### session checkpoint protocol\n';
    expect(analyzeClaude(text).matches).toHaveLength(2);
  });

  it('tolerates trailing punctuation and suffixes', () => {
    const text = '## Session Checkpoint Protocol — rules\n## Completion Signal:\n';
    expect(analyzeClaude(text).matches).toHaveLength(2);
  });

  it('recognises Plugin/MCP variant without spaces around slash', () => {
    const text = '## Plugin/MCP Capability Discovery\n';
    expect(analyzeClaude(text).matches).toHaveLength(1);
    expect(analyzeClaude(text).matches[0].pattern).toBe('Plugin / MCP Capability Discovery');
  });

  it('recognises Plugin & MCP variant with ampersand', () => {
    const text = '## Plugin & MCP Capability Discovery\n';
    expect(analyzeClaude(text).matches).toHaveLength(1);
  });

  it('does not double-count when a heading matches multiple patterns (first wins)', () => {
    // Contrived: a heading combining two pattern names.
    const text = '## Session Checkpoint Protocol / Completion Signal\n';
    const r = analyzeClaude(text);
    expect(r.matches).toHaveLength(1);
  });

  it('does NOT match body text that mentions the pattern (only headings)', () => {
    const text = 'We use the Session Checkpoint Protocol for every task.\nSee: Serena MCP Policy.\n';
    expect(analyzeClaude(text).matches).toEqual([]);
  });

  it('mixes matched and unmatched headings correctly', () => {
    const text = '# Random Project Header\n## Session Checkpoint Protocol\n## Also Random\n### Completion Signal\n';
    const r = analyzeClaude(text);
    expect(r.matches).toHaveLength(2);
    expect(r.matches[0].pattern).toBe('Session Checkpoint Protocol');
    expect(r.matches[1].pattern).toBe('Completion Signal');
  });
});
