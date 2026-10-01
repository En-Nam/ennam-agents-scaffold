export const meta = {
  name: 'review-changes',
  description: 'Review the branch diff through 3 reviewer lenses, then a skeptic per lens tries to refute every finding',
  whenToUse: 'Before opening or merging a PR. Optional args: base ref to diff against (default main).',
  phases: [
    { title: 'Review', detail: 'correctness / conventions / test-intent reviewers read the diff in parallel' },
    { title: 'Verify', detail: 'one skeptic per lens re-reads the code and refutes what it cannot confirm' },
  ],
}

// agent-org dynamic workflow (ennam-agents-scaffold v1.14). Roles come from .claude/agents/
// via agentType. ~6 agents per run. Edit freely - the scaffold never overwrites this file.

function argString(key) {
  if (typeof args === 'string') return args.trim()
  if (args && typeof args[key] === 'string') return args[key].trim()
  return ''
}

const base = argString('base') || 'main'

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'file', 'title', 'detail'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          title: { type: 'string' },
          detail: { type: 'string', description: 'what is wrong, the concrete failure, and the fix direction' },
        },
      },
    },
  },
}

const VERDICTS = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['index', 'refuted', 'reason'],
        properties: {
          index: { type: 'integer' },
          refuted: { type: 'boolean' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

const LENSES = [
  { key: 'correctness', focus: 'bugs, unhandled edge cases, and error handling that hides failures (AGENTS.md Rule 12)' },
  { key: 'conventions', focus: 'violations of AGENTS.md rules and of conventions the surrounding code already follows (Rules 2, 3, 7, 11)' },
  { key: 'tests', focus: 'missing or weak tests - tests that would still pass if the business logic broke (AGENTS.md Rule 9)' },
]

const SCOPE = `Get the change set with \`git diff ${base}...HEAD\` plus \`git diff\` and \`git diff --staged\` for uncommitted work. Review ONLY changed lines and code they directly affect. Do not modify any file.`

const SEVERITY = { blocker: 0, major: 1, minor: 2, nit: 3 }

const perLens = await pipeline(
  LENSES,
  lens => agent(
    `${SCOPE}\n\nLens: ${lens.key} - ${lens.focus}.\nReport only issues you can point to in the code. An empty list is a valid answer; speculation is not.`,
    { label: `review:${lens.key}`, phase: 'Review', agentType: 'reviewer', schema: FINDINGS },
  ),
  (review, lens) => {
    if (!review) {
      log(`review:${lens.key} failed - this lens was NOT covered`)
      return { lens: lens.key, covered: false, findings: [] }
    }
    const findings = review.findings
    if (!findings.length) return { lens: lens.key, covered: true, findings: [] }
    const numbered = findings.map((f, index) => ({ index, ...f }))
    return agent(
      `${SCOPE}\n\nYou are a skeptic. Another reviewer reported the findings below. Re-read the cited code and try to REFUTE each one: wrong line, misread logic, already handled elsewhere, or not actually reachable. Answer by index. If you cannot confirm a finding from the code, mark it refuted.\n\n${JSON.stringify(numbered, null, 2)}`,
      { label: `verify:${lens.key}`, phase: 'Verify', agentType: 'reviewer', schema: VERDICTS },
    ).then(v => {
      if (!v) {
        log(`verify:${lens.key} failed - ${findings.length} finding(s) reported UNVERIFIED`)
        return { lens: lens.key, covered: true, findings: findings.map(f => ({ ...f, lens: lens.key, verified: false })) }
      }
      // Map verdicts back by index - never trust the skeptic to echo finding text (Rule 13).
      // Only an explicit refuted=false confirms a finding; one the skeptic skipped stays,
      // but is labelled unverified rather than silently promoted or dropped (Rule 12).
      const ruled = new Map(v.verdicts.map(x => [x.index, x.refuted]))
      const kept = findings
        .map((f, i) => ({ ...f, lens: lens.key, verified: ruled.get(i) === false }))
        .filter((_, i) => ruled.get(i) !== true)
      const skipped = findings.filter((_, i) => !ruled.has(i)).length
      log(`${lens.key}: ${kept.length}/${findings.length} finding(s) survived the skeptic${skipped ? ` (${skipped} not ruled on - reported UNVERIFIED)` : ''}`)
      return { lens: lens.key, covered: true, findings: kept }
    })
  },
)

const lenses = perLens.map((r, i) => r || { lens: LENSES[i].key, covered: false, findings: [] })
const findings = lenses
  .flatMap(r => r.findings)
  .sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity])

return {
  base,
  uncoveredLenses: lenses.filter(r => !r.covered).map(r => r.lens),
  findings,
}
