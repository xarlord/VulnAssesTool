/**
 * review-diff — Adversarial diamond review of a diff, gated on the real test suite.
 *
 * Built "exactly how the graph-engineering thread recommends" (0xCodez, 14-step
 * roadmap; scenario #4 "Adversarial review of a diff"). Each of the 14 steps is
 * mapped to a concrete construct below:
 *
 *   01 nodes=jobs / edges=data ......... every agent() is a bounded node; only
 *                                        validated outputs flow along edges.
 *   02 linear script = degenerate graph  review lenses don't depend on each
 *                                        other → they fan out instead of queue.
 *   03 give every node a contract ...... each agent() has a JSON `schema`.
 *   04 edge = data contract (free work)  cross-lens dedupe is plain JS, 0 tokens.
 *   05 fan out with parallel() ......... one review agent per lens.
 *   06 fan in at a barrier ............. dedupe + synthesis converge the set.
 *   07 the diamond: split→work→merge ... Scope → lenses → Synthesize.
 *   08 route the edge at runtime ....... deterministic JS router on diff size.
 *   09 put a verifier on the edge ...... adversarial skeptics per finding.
 *   10 isolate nodes (one failure) ..... .filter(Boolean) after every fan-out.
 *   11 add a converging cycle .......... (not needed for a bounded diff; see
 *                                        review-discover.js for the loop variant.)
 *   12 tier the models ................. haiku=scope, sonnet=gate/review/verify,
 *                                        opus=synthesis.
 *   13 topology is cost/latency ....... lenses use pipeline() so each verifies as
 *                                        soon as its review lands; gate runs
 *                                        concurrently with the whole review.
 *   14 self-routing / persistence ..... this file lives in .claude/workflows/ and
 *                                        is re-runnable by name: Workflow({name:'review-diff'}).
 *
 * THE ANCHOR (the thread's central caveat): "a graph of agents checking agents can
 * produce extremely organized nonsense; some evidence has to come from outside the
 * agent system — tests that actually ran." The Gate node is that outside evidence:
 * it RUNS eslint + tsc + build + vitest and its exit codes are ground truth. Agent
 * findings are ranked against it, never above it.
 *
 * Args: { base?: string, range?: string }
 *   range wins if given (e.g. "HEAD~8..HEAD", "--staged").
 *   otherwise the PR-style diff `${base || 'master'}...HEAD` is reviewed.
 */

export const meta = {
  name: 'review-diff',
  description: 'Adversarial diamond review of a diff, gated on the real eslint/tsc/vitest/build suite',
  whenToUse: 'Reviewing a branch/PR diff before merge — especially agent-written changes that a green unit suite might still hide bugs in.',
  phases: [
    { title: 'Scope', detail: 'list changed files, size the diff', model: 'haiku' },
    { title: 'Gate', detail: 'run the real eslint/tsc/build/vitest suite (outside evidence)', model: 'sonnet' },
    { title: 'Review', detail: 'one agent per lens (correctness/security/perf/PRD/tests/style)', model: 'sonnet' },
    { title: 'Verify', detail: 'adversarial skeptics refute each finding', model: 'sonnet' },
    { title: 'Synthesize', detail: 'dedupe, rank against the gate, write report', model: 'opus' },
  ],
}

// ── Node contracts (step 03) ────────────────────────────────────────────────
const SCOPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['files', 'totalLines', 'isLarge', 'summary'],
  properties: {
    files: { type: 'array', items: { type: 'string' }, description: 'changed source files (exclude lockfiles/snapshots)' },
    totalLines: { type: 'number' },
    isLarge: { type: 'boolean', description: 'true if totalLines > 150 OR files > 6' },
    summary: { type: 'string' },
  },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'severity', 'title', 'detail'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { enum: ['critical', 'high', 'medium', 'low'] },
          title: { type: 'string' },
          detail: { type: 'string', description: 'concrete failure scenario: inputs/state → wrong result' },
          suggested_fix: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['survives', 'reason'],
  properties: {
    survives: { type: 'boolean', description: 'true only if a concrete failure was demonstrated' },
    confidence: { enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' },
  },
}

const GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['eslint', 'tscApp', 'serverBuild', 'vitest', 'failedTests', 'summary'],
  properties: {
    eslint: { enum: ['pass', 'fail'] },
    tscApp: { enum: ['pass', 'fail'] },
    serverBuild: { enum: ['pass', 'fail'] },
    vitest: { enum: ['pass', 'fail'] },
    failedTests: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
}

// ── Review lenses (the fan-out set, step 05) ────────────────────────────────
const LENSES = [
  { key: 'correctness', brief: 'logic bugs, wrong conditions, null/undefined deref, off-by-one, broken control flow, regressions, incorrect async/await, swallowed errors.' },
  { key: 'security', brief: 'auth/authz gaps on server routes, SSRF, injection, unsanitized input, secret/token leakage, unsafe HTML/DOM, path traversal.' },
  { key: 'performance', brief: 'N+1 or repeated queries, synchronous heavy work on the request/render path, needless re-renders, unbounded loops, oversized payloads.' },
  { key: 'prd-conformance', brief: 'does the change satisfy or violate the PRD requirement it targets? Read PRD.md as the anchor; flag FR/NFR/CR regressions and half-delivered requirements.' },
  { key: 'test-intent', brief: 'tests that encode WHY not just WHAT (CLAUDE.md Rule 9); vacuous/tautological tests, tests that cannot fail when logic changes, missing coverage for the changed behavior.' },
  { key: 'ts-style', brief: 'Google TS style + project rules: no any, no non-null !, no default export, no underscore identifiers, import type for types, === only, interfaces for object shapes.' },
]

const range = (args && args.range) || `${(args && args.base) || 'master'}...HEAD`
const MAX_VERIFY = 24 // cap adversarial verification fan-out; log if we truncate

// ── 07 Diamond, split: the Scope node (step 01/03), cheap model (step 12) ───
phase('Scope')
const scope = await agent(
  `You are the SCOPE node of a diff-review graph. From the repo root, run via Bash:\n` +
    `  git diff --stat ${range}\n  git diff ${range} --name-only\n` +
    `List the changed SOURCE files only — exclude package-lock.json, *.snap, test-results, and pure-doc *.md unless a doc is the only change. ` +
    `Compute totalLines from the --stat summary. Set isLarge = (totalLines > 150 OR files > 6). Return JSON per the schema.`,
  { label: 'scope', phase: 'Scope', schema: SCOPE_SCHEMA, model: 'haiku', effort: 'low' },
)

if (!scope || scope.files.length === 0) {
  log('Scope found no reviewable source changes — nothing to review.')
  return { scope, gate: null, findings: [], report: 'No reviewable source changes in range ' + range }
}

// 08 Router (deterministic JS — NOT agent reasoning): branch on diff size.
const activeLenses = scope.isLarge ? LENSES : [{ key: 'combined', brief: LENSES.map((l) => `${l.key}: ${l.brief}`).join(' ') }]
log(`Scope: ${scope.files.length} files / ${scope.totalLines} lines → ${scope.isLarge ? 'LARGE: full parallel audit' : 'small: single combined pass'} (${activeLenses.length} lens node(s))`)

const fileList = scope.files.join(' ')

// Run the GATE and the REVIEW concurrently — independent work (step 13 spirit).
const [gate, verifiedNested] = await parallel([
  // ── The ANCHOR: outside-evidence gate. Ground truth, not opinion. ──
  () =>
    agent(
      `You are the GATE node — the ONLY source of ground truth in this graph (real tests, not agent opinion). ` +
        `From the repo root run each command via Bash and record its EXIT CODE (0 = pass):\n` +
        `  1) npx eslint .        (0 errors required; warnings are OK → pass)\n` +
        `  2) npx tsc -p tsconfig.app.json --noEmit\n` +
        `  3) npm run build:server\n` +
        `  4) npx vitest run\n` +
        `Report each as pass/fail strictly by exit code. From the vitest output, list the names of any FAILED test files/tests in failedTests. Do NOT fix anything. Return JSON per the schema.`,
      { label: 'gate', phase: 'Gate', schema: GATE_SCHEMA, model: 'sonnet', effort: 'low' },
    ),

  // ── The review diamond: fan out lenses, verify each as a pipeline (step 13) ──
  () =>
    pipeline(
      activeLenses,
      // Stage 1 (step 05 fan-out node): one review agent per lens.
      (lens) =>
        agent(
          `You are the '${lens.key}' REVIEW node of a diff-review graph. Inspect ONLY these changed files: ${fileList}. ` +
            `Run \`git diff ${range} -- ${fileList}\` via Bash to see the changes, and open the files for context as needed. ` +
            `Report defects STRICTLY through your lens — ${lens.brief} ` +
            `Ignore anything outside your lens (another node owns it). Each finding needs a concrete failure scenario (inputs/state → wrong result), not a vague concern. Return JSON per the schema; empty findings array if the change is clean under your lens.`,
          { label: `review:${lens.key}`, phase: 'Review', schema: FINDINGS_SCHEMA, model: 'sonnet', effort: 'medium' },
        ),
      // Stage 2 (step 09 verifier on the edge): adversarial skeptic per finding.
      (review, lens) => {
        if (!review || !review.findings || review.findings.length === 0) return []
        return parallel(
          review.findings.map((f, i) => () =>
            agent(
              `You are an adversarial SKEPTIC verifying a code-review finding. Your job is to REFUTE it. ` +
                `Read the actual code (git show / open the file at ${f.file}${f.line ? ':' + f.line : ''}) before deciding. ` +
                `Verify from this angle: ${['Can this actually happen at runtime with real inputs?', 'Is it already handled/guarded elsewhere in the code path?', 'Does the type system or an existing test already prevent it?'][i % 3]} ` +
                `Default survives=false unless you can construct a concrete, reproducible failure. Finding:\n` +
                `  [${f.severity}] ${f.title}\n  ${f.detail}`,
              { label: `verify:${lens.key}#${i + 1}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'sonnet', effort: 'medium' },
            ).then((v) => (v && v.survives ? { ...f, lens: lens.key, verdict: v } : null)),
          ),
        )
      },
    ),
])

// 04/06 Fan-in barrier: flatten + dedupe across lenses in plain JS (free work).
const flat = (verifiedNested || []).flat().flat().filter(Boolean)
const seen = new Set()
const confirmed = []
for (const f of flat) {
  const key = `${f.file}:${f.line || 0}:${f.title}`
  if (seen.has(key)) continue
  seen.add(key)
  confirmed.push(f)
}
const rank = { critical: 0, high: 1, medium: 2, low: 3 }
confirmed.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))
const forSynth = confirmed.slice(0, MAX_VERIFY)
if (confirmed.length > MAX_VERIFY) log(`NOTE: ${confirmed.length} confirmed findings; synthesizing the top ${MAX_VERIFY} by severity (rest dropped — not silently).`)

log(`Gate: eslint=${gate?.eslint} tsc=${gate?.tscApp} build=${gate?.serverBuild} vitest=${gate?.vitest}; confirmed findings: ${confirmed.length}`)

// 12 Synthesis on the premium tier: rank findings AGAINST the outside-evidence gate.
phase('Synthesize')
const report = await agent(
  `You are the SYNTHESIS node. Write a concise ranked code-review report in markdown.\n\n` +
    `GROUND TRUTH — the outside-evidence gate (this OUTRANKS every agent finding):\n${JSON.stringify(gate, null, 2)}\n\n` +
    `Adversarially-verified findings (already survived skeptics), most-severe first:\n${JSON.stringify(forSynth, null, 2)}\n\n` +
    `Rules:\n` +
    `- If the gate is RED (any of eslint/tscApp/serverBuild/vitest = fail), the failing gate is finding #1 — a real, executed failure beats any opinion.\n` +
    `- If a finding contradicts a GREEN gate (claims a break the tests would have caught), downgrade or drop it and say why.\n` +
    `- Group surviving findings by file; for each give severity, the concrete failure scenario, and the suggested fix.\n` +
    `- End with a one-line verdict: SHIP / FIX-FIRST / BLOCKED.\n` +
    `Return only the markdown report.`,
  { label: 'synthesize', phase: 'Synthesize', model: 'opus', effort: 'high' },
)

return { range, scope, gate, confirmedCount: confirmed.length, findings: forSynth, report }
