# Plan Dossier

**Language / 语言**: [English](README.md) | [中文](zh-CN/README.md)

A `.plan-dossier/` artifact spec and workflow for long, cross-phase tasks: planning, execution, and review share four layers of artifacts partitioned by how they go stale — eliminating second searches and second planning during execution while keeping the review phase independent.

The full skill definition lives in [SKILL.md](SKILL.md).

---

## The Problem

Planner → Executor is the dominant pattern for multi-agent and resumable workflows: a strong reasoning model plans and produces a `plan.md`; other agents read it and execute step by step. The problem is not the process but the artifact: **we use a human-facing view directly as machine-facing state.**

The plan document is a lossy compression of the entire exploration process. What the executor can read is only the prose — the most valuable intermediate knowledge of planning is lost:

- **Negative knowledge is lost.** The planner evaluated options A, B, C and excluded A and B for a hidden dependency before choosing C, but the plan only says "adopt C". When the executor hits resistance it either re-investigates (burning tokens) or "cleverly" reverts to option A and steps on the mine (second planning).
- **Original anchors are lost.** The planner read concrete line numbers, signatures, and raw data; writing them into the plan degrades them into "follow the existing auth logic". With only the conclusion, the executor has no choice but to grep again (second search).
- **Dynamic state is lost.** A static plan cannot carry deviations and discoveries from execution, and recovery after an interruption is imprecise.

The fix is not a longer plan (it would be re-paid at every handoff, the projection stays lossy, and churn destroys trust). The fix is partitioning: **locations go into a ledger, dynamic state into a handoff layer, rendered views for humans** — each layer verified by the method that matches its staleness mode.

## Install

This skill is plain files — no runtime dependency, works in any agent harness that reads a SKILL.md.

### One-line install

```bash
# Claude Code
curl -fsSL https://raw.githubusercontent.com/Halonnnnn/plan-dossier/main/SKILL.md \
  -o ~/.claude/skills/plan-dossier/SKILL.md --create-dirs

# Codex
curl -fsSL https://raw.githubusercontent.com/Halonnnnn/plan-dossier/main/SKILL.md \
  -o ~/.codex/skills/plan-dossier/SKILL.md --create-dirs

# Qoder
curl -fsSL https://raw.githubusercontent.com/Halonnnnn/plan-dossier/main/SKILL.md \
  -o ~/.qoder/skills/plan-dossier/SKILL.md --create-dirs

# Any agent that reads ~/.agents/skills
curl -fsSL https://raw.githubusercontent.com/Halonnnnn/plan-dossier/main/SKILL.md \
  -o ~/.agents/skills/plan-dossier/SKILL.md --create-dirs
```

Restart your agent session so the skill is discovered, then trigger it by asking for a plan.

### Manual install

```bash
git clone <this-repo> /tmp/plan-dossier
mkdir -p ~/.agents/skills/plan-dossier
cp /tmp/plan-dossier/SKILL.md ~/.agents/skills/plan-dossier/SKILL.md
```

### Other harnesses

- **Other agent CLIs**: copy `SKILL.md` into the harness's skill directory (same shape as the commands above), keeping the `name:` frontmatter.
- **As a repo convention**: commit a `SKILL.md` (or link this one) at the repo root so every agent working in the repo shares the same `.plan-dossier/` spec.

The Chinese version lives at [zh-CN/SKILL.md](zh-CN/SKILL.md); installing the English `SKILL.md` is enough — the skill produces language-neutral YAML/JSONL artifacts.

## How It Works

One pass through the workflow, and which artifacts each phase reads and writes:

```text
          writes                      writes
planner ───────► L0 plan.yaml ──── freeze ────┐
   │  (explores repo,                         │ packet assembly
   │   appends L2 ledger)                     ▼
   │                              ┌──────── executor ────────┐
   │                              │ reads: plan.yaml, ledger │
   │                              │ index, own task card     │
   │                              │ writes: dag[].status,    │
   │                              │ handoff/NN_to_MM.md      │
   │                              └──────────┬───────────────┘
   │                                         │ (per node, until DAG done)
   └── L1 task cards ──► tasks/*.yaml        ▼
                                  review ◄── views/review.packet.md
                                  (isolated: no plan, no ledger,
                                   re-reads changed files)
```

Key mechanics, one line each:

- **L0 + L1 freeze at approval.** Frozen bytes are stable, so they hit prompt prefix caches across handoffs and model switches. Changes go through a version bump that archives the old file; `dag[].status` write-back is the only runtime mutation and is the resume checkpoint.
- **L2 ledger is append-only.** Entries store locations and conclusions (never source content), costs, and `verdict: relevant | excluded | unknown`. Revisions append a new line with `supersedes`. region_sha makes verification cheap whenever a snippet is loaded.
- **L3 handoff has three mandatory sections** — Actual Outputs, Deviations, State Snapshot — so a fresh session resumes with real paths and known-stale entries, not checkboxes.
- **The packet is role-tailored and budgeted at 4K tokens**: stable content first (plan.yaml, ledger index) to protect prefix caching; on overflow the ledger index truncates first while `excluded`, `constraints`, `risks`, `gaps` are never truncated.
- **Review isolation**: the reviewer gets only the original request, the diff, and full before/after files. Prior conclusions are exactly what tends to be wrong; the reviewer never sees them.
- **Trust is replayable, not claimed.** Every `trust: checked` fact carries an `assertion.replay` — a command the planner actually ran — so any consumer can re-validate the conclusion at one command's cost.
- **Anti-regression is explicit.** `excluded` lists what was ruled out and why (frozen, resident); `risks` maps each risk to the acceptance entry that mitigates it (`mitigated_by` anchors); `gaps` declares which judgment dimensions the plan deliberately leaves to the executor.
- **Planning-only scope.** The skill authors the artifacts and defines their semantics; execution, verification, recovery, and review workflows belong to the downstream agents. Resume is opt-in: the checkpoint exists, maintaining it is downstream's call.

## Architecture

```text
.plan-dossier/
├── plan.yaml              # L0 frozen global contract: goal/constraints/acceptance/DAG/decisions/exclusions/risks/gaps
├── tasks/                 # L1 task cards: one card per node; each executor loads only its own
│   ├── 01_extract_validator.yaml
│   └── 02_replace_callers.yaml
├── ledger.jsonl           # L2 search ledger: append-only; locations/conclusions/costs
├── handoff/               # L3 execution-time handoff: written by upstream, read by downstream
│   └── 01_to_02.md
└── views/                 # compiled output, deletable and rebuildable, never the source of truth
    ├── plan.view.md       # human approval view (rendered from L0 + L1)
    └── review.packet.md   # review isolation view (compiled at review handoff)
```

Each layer binds to one staleness mode, which determines its change rules and verification method:

| Layer | Artifact | Readers | Change rule | Verification |
|---|---|---|---|---|
| L0 | plan.yaml | all roles, resident | frozen; changes bump version and archive | human judgment + schema check |
| L1 | tasks/*.yaml | only the owning executor | frozen with L0 | cites reference existence check |
| L2 | ledger.jsonl | planner/executor, on demand | append-only; revisions via supersedes | lazy region_sha comparison (optional) |
| L3 | handoff/*.md | downstream executor | appended after each step | latest file wins |
| views | *.md | humans/reviewers | rebuildable anytime | derived; no verification needed |

Role visibility at handoff:

| | plan.yaml | Task cards | Ledger index | excluded | Source snippets | unverified conclusions |
|---|---|---|---|---|---|---|
| Planning | full | full | index + on demand | full | on demand | full |
| Execution | full | own card only | index + on demand | full | on demand | full |
| Review | not provided | not provided | not provided | not provided | full before/after of changed files | not provided |

Budget rules: L0 ≤ 2K tokens, each task card ≤ 1K, the packet ≤ 4K. When the packet overflows, truncate the ledger index first, then open_questions; `excluded`, `constraints`, `risks`, and `gaps` are never truncated. Assembly order = prompt assembly order: stable content first (system prompt, plan.yaml, ledger index), volatile content last (current task card, handoff, on-demand snippets), protecting the prefix cache.

Artifact organization follows two dimensions — read frequency and change frequency. High-read/low-change content (the plan) must be short and frozen; low-read/high-change content (ledger, handoff) is unbounded and loaded on demand.

## Why "Just Write a More Detailed Plan" Fails

The most intuitive direction, and a dead end:

1. **Repeated payment.** A plan is read once per role per turn. Growing it from 1.5K to 20K tokens adds 18.5K to every one of those reads, most of it irrelevant to the current role.
2. **Projection is irreversible.** A plan is a lossy projection of exploration; length only raises the projection's resolution. Prose descriptions of search results are second-hand transcriptions, less precise than recording the location.
3. **Churn destroys trust.** Longer plans are harder to maintain; frequently-changing documents lose readability and, with it, their value as decision records.

Plan Dossier does not lengthen the plan — it partitions what a plan should not carry into dedicated artifacts: locations into the ledger, dynamic state into the handoff layer, rendered views for humans.

## Why Existing Mechanisms Fall Short

| Mechanism | Solves | Does not solve |
|---|---|---|
| Prompt caching (all vendors) | same-model, same-prefix compute reuse | cross-model, cross-vendor; says nothing about "what to read" |
| hashline-style anchored editing | rejects edits landing at the wrong spot | anchors die with the session; no search history, no help for R2 |
| RAG | similarity retrieval | stores no judgments made (relevant/excluded) or acquisition cost |
| Agent memory | persists historical info | lossy summaries, unverifiable, no staleness handling |

Each is valid on its own, but none produces "reusable acquisition results and search judgments". The main cost of re-searching is the judgment, not the lookup — that is exactly what the ledger persists.

## Design Provenance

The spec was merged from two independent drafts: the four-layer directory form (progressive-disclosure `.plan-dossier/`, per-node task cards, DAG parallelism, three-section handoffs, stable-prefix packet ordering) and the verification mechanisms (R1–R4 re-read taxonomy, staleness-based partitioning, acquisition-cost recording, trust grading, three-level staleness handling, review isolation, packet budget, the falsifiable prediction). Key merge decisions and their rationale:

| Source concept | Treatment | Rationale |
|---|---|---|
| v1 anchors.md (verbatim quotes) | became ledger.jsonl — locations and conclusions only, no content | stored content rots silently with no detection; locations let content load on demand with lazy region_sha verification |
| v1 decisions.md (negative knowledge) | split: one-line exclusions into L0 `excluded` (frozen, resident); detailed pitfalls into ledger entries with `verdict: excluded` | the design doc predicted exclusion benefits are the largest (E1 > E3); anti-regression knowledge must be frozen and resident |
| v1 plan.md (L0) | plan.yaml single source + views/plan.view.md rendering | single source of truth; cites existence is verifiable; no hand-maintained twins |
| v2 steps inlined in plan.yaml | moved to L1 task cards + cites referencing | per-executor context isolation; fixes v1's "L1 copies L2" inconsistency |
| v1 prefix-cache ordering + v2 packet budget | merged into one mechanism: packet ordering = prompt assembly order | two faces of one thing: v1 described the order, v2 the budget and tailoring |
| v2 snippet cache blobs/, blob_sha | excluded from the spec body; mentioned under runtime support | the skill is a file spec; blob storage is tooling and idles without runtime support |
| v2 trust grading, three-level staleness, supersedes revisions | kept in full | the core of production-grade verifiability |
| v1 DAG status table | kept in L0 | the resume checkpoint |
| Naming schemes | ANC-xx / DEC-xx / L-xxxx unified into ledger entries L-xxxx | eliminate dual ID systems |

Field feedback drove seven refinements, now part of the spec:

- **Form confirmation.** Whether `.plan-dossier/` is created and whether `plan.view.md` renders are user-visible decisions, not feature-derived defaults; the minimal form does not render the view by default — approval reads plan.yaml directly. (Later revision: the form is now judged automatically and the judgment stated in one line; the user is asked only when the scope is genuinely unclear.)
- **Risks with coverage checks.** L0 gains a `risks` field; `mitigated_by` anchors (`aN`, `sM.N`) reference acceptance entries, and reference-integrity checking covers the risk-to-test mapping.
- **Single source inside the plan.** The same data list is expanded in exactly one place across L0 and task cards; everywhere else references it by anchor or ID.
- **Gaps declaration.** L0 requires `gaps` (may be empty), explicitly listing judgment dimensions the plan does not cover, semantically separated from `open_questions` (pending rulings); `gaps` and `risks` join the never-truncate list.
- **Replayable assertions.** `trust: checked` requires a replayable `replay` command the planner has actually executed; the executor replays it lazily before relying on the conclusion.
- **Views restricted to their reader.** `plan.view.md` serves only the human approver; executor input never contains views.
- **base.env.** Environment facts (build preconditions, pre-existing baseline failures) live resident in L0 base; staleness is announced via the handoff's State Snapshot.


## Evaluation and the Falsifiable Prediction

Report four metrics together: reuse ratio, tool calls from search to first edit, task pass rate, and erroneous-use-after-staleness rate. Any single metric misleads — voiding everything drives "staleness detection rate" to 100%.

The design carries one falsifiable prediction: exclusions (E1) should benefit more than snippet reuse (E3). If measurement shows the opposite, executors mainly lack content rather than location information, and the architecture's weight should shift from search conclusions toward content caching. Evaluations must include two controls: an equal-token control (give the baseline the same extra budget as ordinary prose) and a plan-length control (record plan document length, confirming the benefit does not come from a longer plan).

Field results (multiple rounds, single executor, full form): net savings estimated at 30–40% of session context, zero directional deviations, zero rework. Small tasks and small projects benefit little; large projects and long tasks benefit clearly.

## Quick Start

1. Read [SKILL.md](SKILL.md). After triggering, the form (full / minimal / plain text) and view rendering are judged automatically from the task's traits and stated in one line; ask the user only when the scope is genuinely unclear. Then follow the artifact specs and workflow.
2. Planning ends when: L0 and L1 are frozen, the ledger is in place, and the approval target (rendered view or plan.yaml) has passed review.
3. Execution follows the downstream agent's own workflow; the dossier carries its state: dag[].status is the resume checkpoint, handoffs record outputs, deviations, and state snapshots.
4. Review: compile review.packet.md — it contains only the request, the diff, before/after files, and acceptance criteria; the review process belongs to the reviewer.
