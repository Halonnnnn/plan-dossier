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

## Planning Workflow Skeleton

The five planning steps in order — full detail in [references/workflow-rules.md](references/workflow-rules.md):

1. **Fix the boundary** — finally verifiable deliverable, hard constraints, dependency and parallelizable set.
2. **Record while exploring** — append ledger entries for expensive searches.
3. **Write L0 plan.yaml** — within the 2K budget, `excluded`/`gaps` present.
4. **Write L1 task cards** — one per DAG node, cites pointing at ledger ids.
5. **Freeze and render** — freeze L0 and L1, render views/plan.view.md when opted in; failed approval goes through a version bump.

## Invariants

Hard prohibitions; operational detail lives in the references:

- Never edit a frozen L0 or task card in place — the only path is a version bump with archival.
- Never modify or delete a ledger line — revisions append a new line via `supersedes`.
- The ledger stores locations and conclusions only, never source content; `cites` carry ids only, never copied content.
- A handoff missing any of its three sections is invalid; a review packet missing any of its four items is invalid.
- review.packet.md never contains plan.yaml, task cards, `excluded`, ledger, or handoff content.
- `excluded` and `gaps` must exist at freeze time — `[]` is allowed, omission is not.
- Budget ceilings are hard: L0 ≤ 2K tokens, each card ≤ 1K, packet ≤ 4K; `excluded`, `constraints`, `risks`, `gaps` are never truncated.

## References

Routed by stage and loaded on demand — this file plus the routed references cover the whole way, with no mid-task reload:

| Current task stage | Required reading | Loading rule |
|---|---|---|
| Plain-text plan (nothing written to disk) | SKILL.md only | load no references/ — maximize context savings |
| Creating a new dossier / version-bump revision | [references/schema.md](references/schema.md) + [references/workflow-rules.md](references/workflow-rules.md) | read both together, once, before writing any file |
| Compiling a handoff packet or review.packet.md | [references/workflow-rules.md](references/workflow-rules.md) + [references/schema.md](references/schema.md) | assemble per the budget-truncation and review-isolation rules |
| Final self-check before delivery | [references/checklist.md](references/checklist.md) | read last, after the artifacts are written; check item by item |

The routing table is bounded by planning and artifact compilation; it prescribes nothing about execution-time behavior.

Cross-file consistency: each rule lives in exactly one file — when a rule changes, update its home file and grep the other three for stale wording.
