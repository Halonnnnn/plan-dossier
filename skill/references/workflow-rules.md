# Workflow and Staleness Rules

Phase workflows (planning, handoff assembly, execution, review), freeze and version-bump rules, and staleness handling. Load this when creating or revising a dossier, compiling a handoff or review packet, or handling a stale entry. Artifact structure is defined in [schema.md](schema.md).

## Planning Phase

1. **Fix the boundary.** Determine three things: the finally verifiable deliverable; global inviolable hard constraints; subtask dependencies and the parallelizable set. If you cannot state them clearly, confirm with the user first — never proceed on a vague goal.
2. **Record while exploring.** After each expensive search, append a ledger entry per the recording criteria table. By the end of planning the ledger is in place, so task cards have something to cite.
3. **Write L0 plan.yaml.** Follow the schema; respect the 2K budget and the required `excluded`/`gaps` rules.
4. **Write L1 task cards.** One card per DAG node, cites pointing at ledger entries.
5. **Render, self-check, freeze.** Generate views/plan.view.md if the user opted for rendering (otherwise the approval target is the plan.yaml and task card content), run the checklist self-check, then freeze L0 and L1 for delivery. If approval fails, bump the version and rewrite; never edit frozen files in place.

## Freeze and Version Bump

- After freezing, L0's bytes never change. To change the plan, bump `version`, archive the old L0 as `plan.v1.yaml`, and move rewritten task cards to `archive/vN/tasks/` (what keeps the plan.vN snapshot self-contained; `tasks/` holds only the current frozen version).
- Task cards freeze together with L0. A step that proves wrong during execution is a plan deviation. When the executor writes handoffs, Deviations is its record channel and resolution goes through a version bump; when it does not, deviation handling is its own workflow. Either way, never edit the card in place.
- Execution progress never enters the dossier. After freezing, plan.yaml bytes never change — there is no runtime write-back, so the stable prefix keeps hitting the cache across handoffs and model switches. Progress, resume, and retry state live in the executor's own workflow.
- `dag[].carryover` is written only by the planner during a version bump. It means static spec inheritance: the node's goal, dependencies, and constraints are materially unchanged from the previous version, so prior results may be reusable. Per node the planner chooses one of two paths: rewrite it, or mark `carryover: true`. The mark is forbidden when anything materially changed: the node's own card (action, outputs, acceptance), its `depends_on` set, the outputs/interface contract of any upstream dependency (a rewritten upstream with unchanged outputs still allows the mark), ledger conclusions its `cites` point at, or a plan-level `constraints` change reaching the node. Whether prior results are actually reused is the executor's call against its own progress record; nothing rolls back automatically.

## Handoff (packet assembly)

When handing off to an executor or back to the planner, assemble in this order:

```text
packet = system prompt + plan.yaml + ledger index + current task card + upstream handoff
```

- Stable content first (plan.yaml, ledger index), volatile content last (current task card, handoff, on-demand snippets). The order is the prompt assembly order; a stable prefix hits the cache.
- Total budget: 4K tokens. When over budget, truncate in this order: ledger index first, then open_questions; `excluded`, `constraints`, `risks`, and `gaps` are never truncated. Truncation happens only inside the assembled view and never edits the source files; open_questions sits at the tail of plan.yaml, so cutting it invalidates the smallest possible prefix-cache span.
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

- Whether and when a handoff is written is the executor's call — writing one is recommended (it closes the correction loop and carries staleness downstream), never required; a dossier without handoffs is not defective. When written, it is named by task card ordinal (`01_to_02.md`).
- All three sections — Actual Outputs, Deviations, State Snapshot — are mandatory; a handoff missing any section is not a valid handoff. Section structure and the example are defined in [schema.md](schema.md).
- When handoffs exist, the latest one for a node wins; it is the record channel for deviations and the carrier that tells downstream which ledger entries went stale.

## Execution Phase

Execution behavior belongs to the executor's own workflow — this spec prescribes none of it. What the artifacts provide:

- plan.yaml, the ledger index, and the owning task card give an executor conclusions, exclusions, and precise locations without re-searching; other task cards are simply not part of its packet (isolation by assembly, not by rule).
- Ledger locators are pointers, not content: a cite is consumed by reading the target region. An entry whose hash does not match is not a sufficient basis for an edit.
- `excluded` and frozen task cards make deviations detectable: a change outside scope or against a frozen step is a plan-invalidation event; when the executor writes handoffs, Deviations is its record channel.
- `trust: checked` assertions are replayable, so any conclusion can be re-validated at the cost of one command.

## Review Phase

The review packet is compiled when the review starts (see views/); isolation is a property of its content, not a rule imposed on the reviewer. How the reviewer works is its own process.

## Staleness Handling

What each staleness level means, and what the artifacts provide for it:

| Level | Meaning | Artifact support |
|---|---|---|
| Location stale | the cited file is deleted or moved — the entry is void by definition | a re-search result is recorded as a new entry |
| Content stale | region_sha mismatch, or the visible content contradicts the entry's intent | the revision is recorded as a new entry with `supersedes` (when recorded); the handoff State Snapshot carries it downstream when handoffs are written — otherwise the entry counts as unverified until re-validated |
| Context stale | content unchanged but callers or dependencies changed, or a declared `invalidation` condition now holds | with an assertion, replay re-validates at one command's cost; without one, the conclusion counts as unverified until re-validated |

- A file change affects only entries pointing into it; the rest of the plan and ledger stay valid. Local staleness or a local invalidation event never voids the whole plan.
- When and how the executor runs these checks is its own workflow; the artifacts' job is to make each check cheap and its result recordable. The third level has no low-cost universal detection — assertions and declared `invalidation` conditions are the partial answer.
