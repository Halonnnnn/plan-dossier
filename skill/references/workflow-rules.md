# Workflow and Staleness Rules

Phase workflows (planning, handoff assembly, execution, review), freeze and version-bump rules, and staleness handling. Load this when running a phase, assembling a packet, or handling a stale entry. Artifact structure is defined in [schema.md](schema.md).

## Planning Phase

1. **Fix the boundary.** Determine three things: the finally verifiable deliverable; global inviolable hard constraints; subtask dependencies and the parallelizable set. If you cannot state them clearly, confirm with the user first — never proceed on a vague goal.
2. **Record while exploring.** After each expensive search, append a ledger entry per the recording criteria table. By the end of planning the ledger is in place, so task cards have something to cite.
3. **Write L0 plan.yaml.** Follow the schema; respect the 2K budget and the required `excluded`/`gaps` rules.
4. **Write L1 task cards.** One card per DAG node, cites pointing at ledger entries.
5. **Freeze and render.** After checks pass, freeze L0 and L1; if the user opted for rendering, generate views/plan.view.md for approval — otherwise the approval target is the plan.yaml and task card content. If approval fails, bump the version and rewrite; never edit frozen files in place.

## Freeze and Version Bump

- After freezing, L0's bytes never change. To change the plan, bump `version` and archive the old file as `plan.v1.yaml`. Byte stability of the frozen part makes prefix caching hit long-term.
- Task cards freeze together with L0. A step that proves wrong during execution is a plan deviation: it is recorded in the handoff's Deviations and resolved through a version bump — never edit the card in place.
- `dag[].status` is the resume checkpoint — execution state lives in this field, not in prose. Updating it is the downstream agent's call, and an update is not a plan modification (no version bump). The value set is defined in [schema.md](schema.md). The five values: `pending` — not started; `in_progress` — an executor is working the node; `done` — finished, with its handoff written; `blocked` — cannot proceed; `needs_review` — the result was produced under an earlier plan version (see the next bullet).
- `needs_review` is written by the planner during a version bump to mark nodes whose results were produced under an earlier plan version. It adds no new executor rule: per existing DAG semantics, anything not `done` already leaves dependents unsatisfied, and recovery goes through the normal version-bump re-approval flow (the planner rewrites and re-freezes). Nodes the change does not affect keep their status; nothing rolls back automatically.

## Handoff (packet assembly)

When handing off to an executor or back to the planner, assemble in this order:

```text
packet = system prompt + plan.yaml + ledger index + current task card + upstream handoff
```

- Stable content first (plan.yaml, ledger index), volatile content last (current task card, handoff, on-demand snippets). The order is the prompt assembly order; a stable prefix hits the cache.
- Total budget: 4K tokens. When over budget, truncate in this order: ledger index first, then open_questions; `excluded`, `constraints`, `risks`, and `gaps` are never truncated.
- The packet contains no views.
- No source content in the packet; snippets are loaded per step, outside the packet.
- Each ledger-index line: entry ID, path and line range, verdict, cost, one-line purpose. No hashes.
- End the index by listing the count and estimated size of unselected entries. Consumers must know the information is incomplete — otherwise they face a false choice between re-reading everything and trusting everything.

Role visibility:

| | plan.yaml | Task cards | Ledger index | excluded | Source snippets | unverified conclusions |
|---|---|---|---|---|---|---|
| Planning | full | full | index + on demand | full | on demand | full |
| Execution | full | own card only | index + on demand | full | on demand | full |
| Review | not provided | not provided | not provided | not provided | full before/after of changed files | not provided |

## Handoff Contract (L3)

- handoff/NN_to_MM.md is written by the upstream executor after finishing a node and named by task card ID (`01_to_02.md`).
- All three sections — Actual Outputs, Deviations, State Snapshot — are mandatory; a handoff missing any section is not a valid handoff. Section structure and the example are defined in [schema.md](schema.md).
- The latest handoff for a node wins; it is the record channel for deviations and the carrier that tells downstream which ledger entries went stale.

## Execution Phase

Execution behavior belongs to the downstream agent's own workflow — this spec prescribes none of it. What the artifacts provide:

- plan.yaml, the ledger index, and the owning task card give an executor conclusions, exclusions, and precise locations without re-searching; other task cards are simply not part of its packet (isolation by assembly, not by rule).
- Ledger locators are pointers, not content: a cite is consumed by reading the target region. An entry whose hash does not match is not a sufficient basis for an edit.
- `excluded` and frozen task cards make deviations detectable: a change outside scope or against a frozen step is a plan-invalidation event, and Deviations is its record channel.
- `dag[].status` is the single authoritative execution state — the resume checkpoint.
- `trust: checked` assertions are replayable, so any conclusion can be re-validated at the cost of one command.

## Review Phase

The review packet is compiled at handoff (see views/); isolation is a property of its content, not a rule imposed on the reviewer. How the reviewer works is downstream's own process; the handoff may serve as a search clue, never as evidence.

## Staleness Handling

What each staleness level means, and what the artifacts provide for it:

| Level | Meaning | Artifact support |
|---|---|---|
| Location stale | the cited file is deleted or moved — the entry is void by definition | a re-search result is recorded as a new entry |
| Content stale | region_sha mismatch, or the visible content contradicts the entry's intent | the revision is recorded as a new entry with `supersedes`; the handoff State Snapshot is the channel that carries it downstream |
| Context stale | content unchanged but callers or dependencies changed, or a declared `invalidation` condition now holds | with an assertion, replay re-validates at one command's cost; without one, the conclusion counts as unverified until re-validated |

- A file change affects only entries pointing into it; the rest of the plan and ledger stay valid. Local staleness or a local invalidation event never voids the whole plan.
- When and how downstream runs these checks is its own workflow; the artifacts' job is to make each check cheap and its result recordable. The third level has no low-cost universal detection — assertions and declared `invalidation` conditions are the partial answer.
