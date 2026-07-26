# Graph workflows (`.claude/workflows/`)

Persistent, version-controlled agent **graphs** for this repo, built per the
graph-engineering method (0xCodez "14-step roadmap"; Louis Bouchard "Graph
Engineering Explained"). A graph fans work out across a fleet, verifies its own
findings, and converges on a result one context could never hold.

**The non-negotiable rule (the method's core caveat):** _"A graph of agents
checking agents can produce extremely organized nonsense. Some evidence has to
come from outside the agent system — tests that actually ran."_ Every graph here
ends at an **outside-evidence gate** — the real `eslint` + `tsc` + `vitest` +
`build` suite — whose exit codes outrank any agent's opinion. (This session
proved why: agent-written fixes looked correct but broke the CVSS parser and
CycloneDX import; only the executed `vitest` gate caught it.)

## `review-diff` — adversarial diamond review of a diff

```
Scope ─(router: size)─┬─ small → single combined pass ─┐
 (haiku)              └─ large → fan out ▼              │
        correctness · security · performance · PRD · test-intent · TS-style   (05 fan-out, sonnet)
                     │  each lens → adversarial skeptics (09 verify), as a pipeline (13)
   Gate (sonnet) ────┤  dedupe across lenses (04/06, free JS)
   eslint/tsc/       ▼
   vitest/build → Synthesize (opus): rank findings AGAINST the gate → report
   [outside evidence]     red gate ⇒ finding #1 · contradicts-green-gate ⇒ dropped
```

Run it:

```
# PR-style: review this branch's diff vs master
Workflow({ name: 'review-diff' })

# or a specific range / staged changes
Workflow({ name: 'review-diff', args: { range: 'HEAD~8..HEAD' } })
Workflow({ name: 'review-diff', args: { range: '--staged' } })
Workflow({ name: 'review-diff', args: { base: 'develop' } })
```

Returns `{ range, scope, gate, confirmedCount, findings, report }`; `report` is
the ranked markdown verdict (SHIP / FIX-FIRST / BLOCKED).

### 14-step mapping

Every step of the roadmap maps to a construct in `review-diff.js` — see the
file header comment. Highlights: nodes = `agent()` with JSON `schema` contracts
(01/03), deterministic size router (08), `parallel()` fan-out + `pipeline()`
verify (05/13), cross-lens dedupe in plain JS (04), `.filter(Boolean)`
isolation (10), model tiering haiku→sonnet→opus (12), and persistence here (14).

Step **11 (converging cycle / discovery of unknown size)** is intentionally not
in `review-diff` — a bounded diff has a known work-list. It belongs in a
loop-until-dry variant (e.g. a `review-discover` graph that keeps spawning
finders until two rounds surface nothing new); add that when a task has
unknown-size scope.
