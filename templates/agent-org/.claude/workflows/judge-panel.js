export const meta = {
  name: 'judge-panel',
  description: 'Three advocates propose competing approaches to a decision, one judge scores them and picks a winner or declares a tie',
  whenToUse: 'Before committing to a non-trivial design choice. Required args: the problem statement. Used by the handoff skill.',
  phases: [
    { title: 'Propose', detail: 'simplicity-first / risk-first / fit-first advocates, read-only' },
    { title: 'Judge', detail: 'scores simplicity, fit, reversibility, test surface' },
  ],
}

// agent-org dynamic workflow (ennam-agents-scaffold v1.14). Codifies the handoff skill's
// 3 advocates + 1 judge panel. 4 agents per run, all read-only.

function argString(key) {
  if (typeof args === 'string') return args.trim()
  if (args && typeof args[key] === 'string') return args[key].trim()
  return ''
}

const question = argString('question')
if (!question) {
  throw new Error('Usage: /judge-panel <problem statement> - the decision to make is required (AGENTS.md Rule 12: no guessed default).')
}

const PROPOSAL = {
  type: 'object',
  required: ['approach', 'rationale', 'tradeoffs', 'steps'],
  properties: {
    approach: { type: 'string', description: 'one-sentence summary' },
    rationale: { type: 'string' },
    tradeoffs: { type: 'string', description: 'what this approach gives up' },
    steps: { type: 'array', items: { type: 'string' } },
  },
}

const VERDICT = {
  type: 'object',
  required: ['winner', 'tie', 'verdict', 'scores'],
  properties: {
    winner: { type: 'string', enum: ['A', 'B', 'C', 'none'] },
    tie: { type: 'boolean' },
    verdict: { type: 'string', description: 'why the winner wins, and what to graft from the runners-up' },
    scores: {
      type: 'array',
      items: {
        type: 'object',
        required: ['option', 'simplicity', 'fit', 'reversibility', 'testSurface'],
        properties: {
          option: { type: 'string', enum: ['A', 'B', 'C'] },
          simplicity: { type: 'integer', minimum: 1, maximum: 5 },
          fit: { type: 'integer', minimum: 1, maximum: 5 },
          reversibility: { type: 'integer', minimum: 1, maximum: 5 },
          testSurface: { type: 'integer', minimum: 1, maximum: 5 },
        },
      },
    },
  },
}

const ADVOCATES = [
  { key: 'simplicity', lens: 'the simplest approach that fully solves it - minimum code, no speculative features (AGENTS.md Rule 2)' },
  { key: 'risk', lens: 'the lowest-risk approach - reversibility, small blast radius, explicit failure modes' },
  { key: 'fit', lens: "the approach that best fits this codebase's existing patterns and conventions (AGENTS.md Rule 11)" },
]
const LETTERS = ['A', 'B', 'C']

const READ_ONLY = 'Read whatever code and docs you need, but do NOT modify any file and do NOT run commands with side effects.'

// Barrier is intentional: the judge must compare all proposals at once.
const proposals = await parallel(ADVOCATES.map(a => () => agent(
  `Decision to make:\n${question}\n\n${READ_ONLY}\n\nArgue for ${a.lens}. Propose ONE concrete approach.`,
  { label: `advocate:${a.key}`, phase: 'Propose', schema: PROPOSAL },
)))

const options = proposals
  .map((p, i) => (p ? { advocate: ADVOCATES[i].key, ...p } : null))
  .filter(Boolean)
  .map((p, i) => ({ option: LETTERS[i], ...p }))

if (options.length < 2) {
  log(`Only ${options.length} proposal(s) came back - no panel to judge`)
  return { question, tie: true, winner: null, verdict: 'Fewer than 2 proposals survived. Decide manually.', options }
}

const judged = await agent(
  `Decision to make:\n${question}\n\n${READ_ONLY}\n\nScore each option 1-5 on simplicity, fit to this codebase, reversibility, and test surface (higher = better). Pick the winner by its option letter. If the top two are not clearly separable, set tie=true and winner="none".\n\n${JSON.stringify(options, null, 2)}`,
  { label: 'judge', phase: 'Judge', schema: VERDICT },
)

if (!judged) {
  log('Judge agent failed - returning proposals without a verdict')
  return { question, tie: true, winner: null, verdict: 'Judge failed. Decide manually.', options }
}

// Resolve the winner by letter against our own list - never by text the judge echoed (Rule 13).
const winner = judged.tie ? null : options.find(o => o.option === judged.winner) || null
return {
  question,
  tie: judged.tie || !winner,
  winner,
  verdict: judged.verdict,
  scores: judged.scores,
  options,
}
