export const meta = {
  name: 'fix-loop',
  description: 'Run a check command, have the implementer fix what fails, repeat until green or progress stalls',
  whenToUse: 'When a build, type-check, lint or test command is red. Required args: the exact command, e.g. "npm test".',
  phases: [
    { title: 'Check', detail: 'implementer runs the command and counts failures (no edits)' },
    { title: 'Fix', detail: 'implementer fixes root causes, one round at a time' },
  ],
}

// agent-org dynamic workflow (ennam-agents-scaffold v1.14). Serial on purpose: fixes touch
// shared files, so there is no parallel fan-out. At most 5 checks + 4 fixes = 9 agents.

function argString(key) {
  if (typeof args === 'string') return args.trim()
  if (args && typeof args[key] === 'string') return args[key].trim()
  return ''
}

const check = argString('check')
if (!check) {
  throw new Error('Usage: /fix-loop <check command>, e.g. /fix-loop npm test (AGENTS.md Rule 12: no guessed default).')
}

const MAX_CHECKS = 5
const MAX_STALLS = 2

const RUN = {
  type: 'object',
  required: ['passed', 'failureCount', 'failures'],
  properties: {
    passed: { type: 'boolean' },
    failureCount: { type: 'integer', minimum: 0 },
    failures: { type: 'array', items: { type: 'string' }, description: 'one line per failure: location + message, at most 20' },
  },
}

const rounds = []
let previous = Infinity
let stalls = 0

for (let n = 1; n <= MAX_CHECKS; n++) {
  const run = await agent(
    `Run exactly this command from the repository root and report the result: ${check}\nDo NOT modify any file in this step.`,
    { label: `check:${n}`, phase: 'Check', agentType: 'implementer', schema: RUN },
  )
  if (!run) {
    log(`check:${n} agent failed - stopping`)
    return { check, status: 'error', rounds }
  }
  rounds.push({ check: n, passed: run.passed, failureCount: run.failureCount })
  if (run.passed) return { check, status: 'green', rounds }

  // A round that does not reduce the failure count is a stall; two in a row ends the loop.
  stalls = run.failureCount >= previous ? stalls + 1 : 0
  previous = run.failureCount
  if (stalls >= MAX_STALLS) {
    log(`No progress for ${MAX_STALLS} consecutive rounds (${run.failureCount} failure(s)) - stopping`)
    return { check, status: 'stalled', rounds, failures: run.failures }
  }
  if (n === MAX_CHECKS) {
    log(`Still red after ${MAX_CHECKS} checks - stopping`)
    return { check, status: 'max-rounds', rounds, failures: run.failures }
  }

  const fixed = await agent(
    `\`${check}\` fails with ${run.failureCount} failure(s):\n${run.failures.join('\n')}\n\nFix the root causes in the code under test. Do not skip, delete or weaken tests to make them pass (AGENTS.md Rule 12); if a test itself is wrong, fix it and say why. Run the command yourself before reporting.`,
    { label: `fix:${n}`, phase: 'Fix', agentType: 'implementer' },
  )
  if (fixed === null) {
    log(`fix:${n} agent failed - stopping`)
    return { check, status: 'error', rounds, failures: run.failures }
  }
}
