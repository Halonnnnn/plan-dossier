---
name: plan-dossier
description: >-
  Triggers when the user asks for a plan for cross-phase or handoff-prone work: making a plan, planning a task, breaking down multi-step work, or producing a plan document. Generates a four-layer verifiable `.plan-dossier/` artifact directory that reduces repeated searching and repeated reasoning across phases. After triggering, judge the artifact form automatically (full / minimal / plain text) and ask the user only when the task's scope is genuinely unclear. Typical scenarios: handing planning output to another executor model or fresh session; multiple executors running in parallel; a task that will cross context compaction; review must stay independent from execution; excluded directions need to be recorded.
---

# Plan Dossier

Turn planning-phase investment into four layers of artifacts partitioned by how they go stale: the plan freezes, the ledger is append-only, handoffs record dynamic state. Executors locate code by reference instead of re-searching; reviewers get an isolated view and are not anchored by prior conclusions.

## Scope and Responsibility

Plan Dossier is a planning and artifact-authoring skill, not an execution orchestration framework. It produces complete, accurate, consistent, handoff-ready planning artifacts; downstream agents consume them through their own workflows.

It defines:

- Planning methodology and artifact structure (L0–L3, views, packets).
- The semantics and relationships of planning data: task states and dependencies, exclusions, trust, staleness, supersession.
- Task decomposition, constraints, and acceptance criteria.
- Content and quality requirements of what it hands off: a handoff lacking its three sections is not a valid handoff; a review packet lacking its four items is not a valid review packet.

It does not prescribe:

- How downstream agents execute tasks and respond to deviations or failures: tool order, editing procedure, sequencing.
- How artifacts are consumed: read order, verification timing, recovery procedure.
- Reviewer behavior or review procedures.

For artifacts written during execution, the responsibility split:

| Artifact | Plan Dossier defines | Downstream agent decides |
|---|---|---|
| `dag[].status` | state meanings; the resume-checkpoint semantics | whether and when to update |
| handoff/*.md | section structure and field semantics | when to generate and write |
| Deviations | what a deviation record means and contains | what actually gets recorded |
| State Snapshot | what the snapshot must express | when to update and consume |

Resume is opt-in: the artifacts provide the checkpoint; nothing guarantees downstream maintains it. Removing execution prescriptions removes no data-integrity requirements — only "when and who" moves downstream.

## Form Selection

After triggering, judge the form from the task's traits (full / minimal / plain text), state the judgment and its reason in one line, and start — do not ask the user to confirm a self-explanatory judgment. When none of the full-form conditions hold and the task is small, plain text is the default — creating artifacts is never mandatory. Ask only when the task's scope is genuinely unclear (e.g. it could plausibly be either full or plain text, or it touches a boundary like schema or security). If the user's instruction already pins the form ("produce a full plan", "just give me a simple list"), follow it directly.

**Full form** (all four layers + views). Recommend when any of the following holds:

- Planning and execution happen in different models, sessions, or roles; the executor needs to know "where the code is and what not to read".
- Multiple executors run in parallel or in batches over the same plan, each loading only its own context.
- The task is long enough that context compaction will occur, and precision must survive it.
- The review step needs to judge the result independently.
- Planning excluded several directions; without the exclusion record, the executor will likely regress into them.

**Minimal form** (single node, no handoff, no context compaction):

- plan.yaml (single-node dag) + one task card + ledger.jsonl (may be an empty file); no handoff/.
- Simplification removes files, not verification rules: the cites reference system, trust grading, `excluded`, and `gaps` required-field rules all still apply.

**Plain-text plan** (no `.plan-dossier/` directory; respond directly):

- Pure research whose deliverable is itself a document, with no execution phase afterward.
- The user just wants a lightweight plan. State this skill's applicability boundary and produce what was asked.

Rendering `views/plan.view.md` follows the form default: full form renders by default (needed for human approval and independent review); minimal form does not render by default — approval reads plan.yaml directly. State the default in the same one-line judgment; the user can override it before or after planning starts. `review.packet.md` is unaffected; it is compiled on demand at review handoff.

## Core Principles

1. **Partition artifacts by how they go stale, not by topic.** Source locations only rot; search conclusions can be wrong without ever announcing it; plan clauses require human judgment. Content with different verification methods and responsibility boundaries must not share a file.
2. **Record based on reacquisition cost.** An entry's value ≈ reacquisition cost × expected reuse count. A location found after many searches, or a module excluded after exploration, is worth recording; opening a known path is not.
3. **Re-fetch by default; do not reuse by default.** Reuse only after the hash (or visual check) matches exactly; any mismatch means re-read. The cost of acting on a wrong conclusion is usually 100x the cost of re-reading, so the conservative strategy has lower expected loss.
4. **Tailor handoff content per role.** Executors need conclusions, exclusions, and precise locations; reviewers need only the original request, the diff, and full before/after files — never the planning conclusions.
5. **Single source of truth + rendered views.** Machines read plan.yaml and task cards; humans read views rendered from them. Never maintain two equivalent documents by hand. The same applies inside L0 + L1: any data list (key list, whitelist, enum) is expanded in exactly one place; everywhere else references it by anchor or ID.

## Directory Structure

All under `.plan-dossier/`. Each layer binds to one staleness mode, which determines its change rules and verification method:

| Layer | File | Readers | Change rule | Verification |
|---|---|---|---|---|
| L0 | plan.yaml | all roles, resident | frozen; changing it bumps the version and archives the old file | human judgment + schema check |
| L1 | tasks/NN_*.yaml | only the owning executor | frozen together with L0 | cites reference existence check |
| L2 | ledger.jsonl | planner/executor, on demand | append-only; revisions via supersedes | lazy region_sha comparison (optional) |
| L3 | handoff/NN_to_MM.md | downstream executor | appended after each completed step | latest file wins |
| views | plan.view.md, review.packet.md | humans/reviewers | rebuildable at any time | derived; no verification needed |

## Artifact Specs

### L0 plan.yaml

```yaml
task_id: refactor-payment
version: 1
base: {repo: "acme/api", commit: "abc123", env: ["source env.local.sh before running tests", "baseline build has 1 pre-existing failure unrelated to this task"]}
objective: "Consolidate all payment validation into PaymentValidator"

constraints:
  - id: c1
    text: "Do not modify the billing layer's structure"
    why: "Upstream routes by layer; changing layers breaks A/B traffic splitting"
    trust: unverified
    by: {model: "planner-a", run: "r17", at: "2026-11-19T10:00:00+08:00"}
    rederive_cost: high
  - id: c2
    text: "PaymentService.validate's public signature must not change"
    trust: checked
    assertion: {replay: "grep -rn 'def validate' src/payment/", expects: "exactly one match, in PaymentService"}

acceptance:
  - "Every order path goes through PaymentValidator"
  - "All existing payment tests pass"

dag:
  - {id: s1, task: "tasks/01_extract_validator.yaml", depends_on: [], status: pending}
  - {id: s2, task: "tasks/02_replace_callers.yaml", depends_on: [s1], status: pending}

risks:
  - {id: r1, text: "After consolidation, RefundService bypasses validation", mitigated_by: ["s2.1"]}

decisions:
  - id: d1
    text: "Composition over inheritance"
    why: "Avoids constructor parameter sprawl in PaymentService"
    trust: unverified
    by: {model: "planner-a", run: "r17", at: "2026-11-19T10:05:00+08:00"}

gaps:  # judgment dimensions the plan explicitly does not cover; the executor judges these on its own
  - "Boundary branches for zero-amount inputs were not derived case by case"

open_questions:
  - "Does the refund path also count as a validation entry point (unconfirmed)"

excluded:
  - {locator: "src/billing.py", reason: "payment validation is not in the billing layer"}
  - {locator: "src/legacy/**", reason: "deprecated, not part of the call chain"}
```

Writing rules:

- Keep the file within 2K tokens. Task details have moved to L1; exceeding the budget means something should sink into the ledger or a task card.
- `excluded` and `gaps` must exist at freeze time, may be `[]`, and must not be omitted. When `excluded` is empty, note "no exclusions made" in `open_questions`. `gaps` is the planner's explicit answer to "which judgment dimensions were deliberately left uncovered"; an empty list means every known dimension is covered.
- `gaps` and `open_questions` mean different things: gaps are known uncovered dimensions that need no answer; open_questions are pending questions awaiting an answer or ruling. Never mix them.
- Every `risks[].mitigated_by` must be non-empty. Anchor format: `aN` points to the Nth entry of L0 acceptance; `sM.N` points to the Nth acceptance entry of task card M. A risk with no anchor is not "mitigated" — demote it to `open_questions` with a note.
- `base.env` records environment facts that would waste executor trial-and-error if omitted (build preconditions, pre-existing baseline failures, etc.), and belongs to the task baseline alongside commit. The ledger's locator is path+span and cannot hold environment facts, and the ledger index can be truncated in the packet — so env facts live in base, resident. When an entry goes stale (e.g. the baseline gets fixed), the change is carried by the handoff's State Snapshot; the frozen L0 is never edited for it.
- `dag[].status` has exactly five values: `pending`, `in_progress`, `done`, `blocked`, `needs_review`. Status is the resume checkpoint — execution state lives in this field, not in prose. Plan Dossier defines the meanings; updating is the downstream agent's call, and an update is not a plan modification (no version bump).
- `needs_review` is written by the planner during a version bump to mark nodes whose results were produced under an earlier plan version. It adds no new executor rule: per existing DAG semantics, anything not `done` already leaves dependents unsatisfied, and recovery goes through the normal version-bump re-approval flow (the planner rewrites and re-freezes). Nodes the change does not affect keep their status; nothing rolls back automatically.
- `trust: checked` requires an `assertion` whose `replay` is a command or unambiguous symbol lookup that can be executed verbatim; the planner must have actually run it once before marking checked — otherwise mark unverified. `trust: unverified` requires `by` (source) and `rederive_cost` (low/medium/high), and cross-check before use.
- After freezing, the file's bytes never change. To change the plan, bump `version` and archive the old file as `plan.v1.yaml`. Byte stability of the frozen part makes prefix caching hit long-term.
- One-line anti-regression exclusions go in `excluded`; detailed pitfalls go in the ledger (entries with `verdict: excluded`). L0 never carries long-form records.
- `excluded` is a plan-scope constraint: modifying an excluded item is a plan-invalidation event. The event is recordable (Deviations) and its impact assessable (which decisions and tasks it touches); revision, when needed, goes through a version bump. A local invalidation never auto-voids the rest of the plan. How downstream responds to the event is its own workflow.

### L1 Task Card

```yaml
id: s1
action: "Extract validation logic into a new module"
depends_on: []
cites: ["L-0042", "L-0017"]
outputs: ["src/payment/validator.py"]
acceptance:
  - "PaymentValidator covers all 5 validation rules"
```

Writing rules:

- One card per DAG node, filename `NN_action_summary.yaml`, NN matching the `dag[].id` number.
- Keep each card within 1K tokens. Exceeding it means the card mixed in another node's content or ledger details.
- `cites` references only entry IDs that already exist in ledger.jsonl — never copies entry content, never quotes source. The executor looks up the locator by ID in the ledger, then reads the source at that location.
- `acceptance` holds this node's verifiable assertions, complementary to L0's global acceptance, and must not be empty.
- Task cards freeze together with L0. A step that proves wrong during execution is a plan deviation: it is recorded in the handoff's Deviations and resolved through a version bump — never edit the card in place.

### L2 ledger.jsonl

Append-only, one entry per line:

```jsonc
{"id": "L-0042", "locator": {"path": "src/payment.py", "span": [20, 45]}, "verdict": "relevant", "intent": "locate the payment validation entry point", "cost": {"tool_calls": 12, "tokens": 4800}, "by": {"model": "planner-a", "run": "r17", "at": "2026-11-19T10:02:00+08:00"}, "supersedes": null, "region_sha": "sha256:44ae...", "invalidation": ["PaymentService.validate's signature changes", "src/payment.py is moved or renamed"]}
```

Recording is always discretionary, decided by reacquisition cost measured in search effort (not read effort): write an entry only when its value (reacquisition cost × expected reuse) clearly exceeds the writing cost; an empty or sparse ledger is acceptable — never record for compliance:

| Scenario | Record? | Why |
|---|---|---|
| Known path, opened directly | No | reopening costs a few hundred tokens |
| Located after multiple greps that eliminated many candidates | Yes | reacquiring means searching all over again |
| Excluded a module or directory | Yes | one line prevents one broad exploration |
| Partial read of a large file | Yes | re-reading requires re-locating |

Field rules:

- `verdict` takes exactly one of `relevant`, `excluded`, `unknown`.
- To revise a conclusion, append a new line with `supersedes` pointing at the replaced entry; never edit the original line.
- `region_sha` is optional. Compute it automatically when runtime support exists; omit it otherwise — an entry without a hash carries no integrity guarantee and is not by itself a sufficient basis for an edit; the target region needs a read at edit time.
- `invalidation` is optional and authored at planning time: declarative conditions under which the entry's conclusion no longer holds (e.g. "the cited symbol's signature changes", "the cited file moves"). It is planner-side metadata that gives the existing context-stale process an explicit trigger; it adds no obligation to downstream phases — an executor loading a snippet follows exactly the same staleness process as before. Omit when no concrete condition is known; a vague condition ("the code changes") is worse than none.
- The ledger never stores source content: stored content rots silently with no way to detect it. The ledger stores only locations and conclusions; read the source at the location when needed.

### L3 handoff/NN_to_MM.md

Written by the upstream executor after finishing, named by task card ID: `01_to_02.md`. All three sections are mandatory:

```markdown
# s1 → s2

## Actual Outputs
- src/payment/validator.py (new, 5 validation rules)

## Deviations
- The plan said 3 call sites; there are actually 4, the 4th in RefundService

## State Snapshot
- L-0042 is stale (src/payment.py was modified in s1); s2 must re-read before starting
- The new symbol PaymentValidator is directly referenceable by s2
```

- `Actual Outputs`: paths and summaries of files actually produced or modified.
- `Deviations`: deviations from the plan, new discoveries, interim compromises. Write "none" if there are none.
- `State Snapshot`: what the downstream must know before starting, including which ledger entries this modification made stale.

### views/ (compiled output)

- `plan.view.md`: the human review view rendered from plan.yaml + tasks/, containing goal, constraints, DAG table, per-card summaries, exclusions. This is what goes to the user for approval, not raw YAML. Its only reader is the human approver.
- `review.packet.md`: the review isolation view containing exactly four things — the original request, the diff, full before/after content of every changed file, and the acceptance criteria. Compiled at review handoff, never hand-edited; contains no plan.yaml, task cards, excluded, ledger, or handoff.
- The entire views/ directory is deletable and rebuildable; on conflict, L0–L3 win.

## Workflow

### Planning Phase

1. **Fix the boundary.** Determine three things: the finally verifiable deliverable; global inviolable hard constraints; subtask dependencies and the parallelizable set. If you cannot state them clearly, confirm with the user first — never proceed on a vague goal.
2. **Record while exploring.** After each expensive search, append a ledger entry per the recording criteria table. By the end of planning the ledger is in place, so task cards have something to cite.
3. **Write L0 plan.yaml.** Follow the schema; respect the 2K budget and the required `excluded`/`gaps` rules.
4. **Write L1 task cards.** One card per DAG node, cites pointing at ledger entries.
5. **Freeze and render.** After checks pass, freeze L0 and L1; if the user opted for rendering, generate views/plan.view.md for approval — otherwise the approval target is the plan.yaml and task card content. If approval fails, bump the version and rewrite; never edit frozen files in place.

### Handoff (packet assembly)

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

### Execution Phase

Execution behavior belongs to the downstream agent's own workflow — this spec prescribes none of it. What the artifacts provide:

- plan.yaml, the ledger index, and the owning task card give an executor conclusions, exclusions, and precise locations without re-searching; other task cards are simply not part of its packet (isolation by assembly, not by rule).
- Ledger locators are pointers, not content: a cite is consumed by reading the target region. An entry whose hash does not match is not a sufficient basis for an edit.
- `excluded` and frozen task cards make deviations detectable: a change outside scope or against a frozen step is a plan-invalidation event, and Deviations is its record channel.
- `dag[].status` is the single authoritative execution state — the resume checkpoint.
- `trust: checked` assertions are replayable, so any conclusion can be re-validated at the cost of one command.

### Review Phase

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

## Verification Checklist

Run each item before delivering a `.plan-dossier/`; fix anything that fails first:

1. Reference integrity: after scanning every task card's `cites`, every ID resolves to a line in ledger.jsonl; every `dag[].task` file exists; every `risks[].mitigated_by` anchor (`aN`, `sM.N`) resolves to an entry in L0 acceptance or the corresponding task card.
2. Trust grading completeness: every `trust: checked` entry has an `assertion`; every `trust: unverified` entry has `by` and `rederive_cost`.
3. `excluded` and `gaps` fields exist; when empty they are `[]`, and an empty `excluded` is explained in `open_questions`.
4. Budget compliance: plan.yaml estimated at ≤ 2K tokens; each task card ≤ 1K; packet ≤ 4K and ends with the unselected-entries listing.
5. Separation of duties: plan.yaml contains no search-process detail (that is the ledger's job) and no source quotations; task cards contain no copied ledger content or source.
6. Review isolation: review.packet.md contains no verbatim objective from plan.yaml, no excluded entries, no ledger IDs.
7. Render consistency: views/plan.view.md is rendered from the currently frozen L0 + L1, with DAG status matching plan.yaml.
8. Execution audit trail (post-execution diagnostic, not a plan-delivery gate): done task cards should have complete handoff files. A missing trail means downstream skipped maintenance — report it; it does not block the plan.
9. Single source (visual check, cannot be mechanized): across L0 and all task cards, the same data list (key list, whitelist, enum) is expanded in exactly one place; everywhere else it is referenced by anchor or ID.

## Common Mistakes

Mistakes not already covered by a rule above — each restates a failure mode the rules do not name:

- **Writing L0 as a long prose document.** It is re-paid by every role at every handoff, mostly with content irrelevant to the current role.
- **Omitting exclusions.** Writing "how" without "why not the other way" is the number one cause of executors regressing when they hit resistance.
- **Replacing handoffs with checkboxes.** Resuming needs real output paths and deviation records; `[x]` cannot carry context into a new session.
- **Giving the reviewer the plan or exclusions.** It destroys review independence; exclusions also tempt the reviewer to skip regions.

## Degradation and Runtime Support

This skill is a file spec and runs with no tooling at all: the agent appends ledger entries manually per the recording criteria, an entry without region_sha is consumed by reading the target region when it is used, and verification degrades to "visual comparison + staleness process on mismatch".

With runtime support (a hook or MCP tool), two things automate without changing any file format:

- auto-generate ledger entries and compute region_sha on read/grep/glob calls;
- auto-run lazy region_sha verification when a snippet loads, prompting re-fetch on staleness; content caching (hash-deduplicated blob storage) can be added further down, but that is tool-layer implementation outside this spec.

## Evaluation

Always report four metrics together: reuse ratio, tool calls from search to first edit, task pass rate, and erroneous-use-after-staleness rate. Reporting a single metric misleads — voiding everything drives "staleness detection rate" to 100%.

The skill carries one falsifiable prediction: the benefit of exclusions should exceed the benefit of snippet reuse. If measurement shows the opposite, executors mainly lack content rather than location information, and content-side support (caching) should be prioritized.
