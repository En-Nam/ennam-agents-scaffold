import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';

// v1.9.0 — Feature A per issue #4a (Ian). Scans CLAUDE.md HEADINGS for the 12
// section patterns that commonly overlap with scaffold-managed instructions.
// Body prose is ignored to avoid false positives. Non-destructive; caller
// exits after printAnalysis.

export interface DetectedSection {
  pattern: string;
  line: number;
  heading: string;
}

export interface AnalyzeResult {
  matches: DetectedSection[];
}

// Ordered — first match wins per heading (see "one pattern per heading" test).
export const PATTERNS: { name: string; regex: RegExp }[] = [
  { name: 'Task Startup Protocol', regex: /\btask\s+startup\s+protocol\b/i },
  { name: 'Adaptive Session Boot Protocol', regex: /\b(?:adaptive\s+)?session\s+boot\s+protocol\b/i },
  { name: 'Skill Loading Policy', regex: /\bskill\s+loading\s+policy\b/i },
  { name: 'Serena MCP Policy', regex: /\bserena(?:\s+mcp)?\s+policy\b/i },
  { name: 'Session Checkpoint Protocol', regex: /\bsession\s+checkpoint\s+protocol\b/i },
  { name: 'Completion Signal', regex: /\bcompletion\s+signal\b/i },
  { name: 'Workflow', regex: /\bworkflow\b/i },
  { name: 'Verification', regex: /\bverification\b/i },
  { name: 'Plugin / MCP Capability Discovery', regex: /\bplugin\s*[/&\s]\s*mcp\s+capability\s+discovery\b/i },
  { name: 'Plugin Activation Matrix', regex: /\bplugin\s+activation\s+matrix\b/i },
  { name: 'End-of-Task Sentinel', regex: /\bend[-\s]of[-\s]task\s+sentinel\b/i },
  { name: 'Source of Truth', regex: /\bsource\s+of\s+truth\b/i },
];

export function analyzeClaude(text: string): AnalyzeResult {
  const matches: DetectedSection[] = [];
  if (!text) return { matches };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
    if (!m) continue;
    const heading = m[2].trim();
    for (const p of PATTERNS) {
      if (p.regex.test(heading)) {
        matches.push({ pattern: p.name, line: i + 1, heading });
        break;
      }
    }
  }
  return { matches };
}

export async function runAnalyzeClaude(cwd: string): Promise<void> {
  const p = path.join(cwd, 'CLAUDE.md');
  let text: string;
  try {
    text = await readFile(p, 'utf8');
  } catch {
    console.log(pc.dim(`  No CLAUDE.md found at ${p}. Nothing to analyze.`));
    return;
  }
  const result = analyzeClaude(text);
  printAnalysis(result, p);
}

function printAnalysis(result: AnalyzeResult, filePath: string): void {
  if (result.matches.length === 0) {
    console.log(pc.green(`  ✓ Scanned ${filePath} — no overlap patterns detected.`));
    return;
  }
  const n = result.matches.length;
  console.log(pc.bold(`  Scanned ${filePath} — ${n} potential overlap${n === 1 ? '' : 's'}:`));
  console.log();
  for (const m of result.matches) {
    console.log(`  ${pc.yellow('⚠')}  L${m.line}: "${m.heading}"  ${pc.dim(`(matches "${m.pattern}")`)}`);
  }
  console.log();
  console.log(pc.dim('  Recommendation:'));
  console.log(pc.dim('  These sections likely overlap with scaffold-managed instructions. Run with'));
  console.log(pc.dim('  --dry-run to preview the plan, or review the diff after install.'));
  console.log(pc.dim('  (v1.10.0 will add --claude-strategy=minimal for a lighter injection.)'));
}
