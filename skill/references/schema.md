# Artifact Specs

Structure specs, writing rules, and complete examples for every artifact file (L0–L3 and views/). Load this when writing or reviewing any `.plan-dossier/` file; the layer overview is the Directory Structure table in SKILL.md.

## L0 plan.yaml

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
  - {id: s1, task: "tasks/01_extract_validator.yaml", depends_on: []}
  - {id: s2, task: "tasks/02_replace_callers.yaml", depends_on: [s1]}

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

excluded:
  - {locator: "src/billing.py", reason: "payment validation is not in the billing layer"}
  - {locator: "src/legacy/**", reason: "deprecated, not part of the call chain"}

open_questions:
  - "Does the refund path also count as a validation entry point (unconfirmed)"
```

Writing rules:

- Keep the file within 2K tokens. Task details have moved to L1; exceeding the budget means something should sink into the ledger or a task card.
- `excluded` and `gaps` must exist at freeze time, may be `[]`, and must not be omitted. When `excluded` is empty, note "no exclusions made" in `open_questions`. `gaps` is the planner's explicit answer to "which judgment dimensions were deliberately left uncovered"; an empty list means every known dimension is covered.
- `gaps` and `open_questions` mean different things: gaps are known uncovered dimensions that need no answer; open_questions are pending questions awaiting an answer or ruling. Never mix them.
- Every `risks[].mitigated_by` must be non-empty. Anchor format: `aN` points to the Nth entry of L0 acceptance; `sM.N` points to the Nth acceptance entry of task card M. A risk with no anchor is not "mitigated" — demote it to `open_questions` with a note.
- `base.env` records environment facts that would waste executor trial-and-error if omitted (build preconditions, pre-existing baseline failures, etc.), and belongs to the task baseline alongside commit. The ledger's locator is path+span and cannot hold environment facts, and the ledger index can be truncated in the packet — so env facts live in base, resident. When an entry goes stale (e.g. the baseline gets fixed), the change is carried by the handoff's State Snapshot when handoffs are written; the frozen L0 is never edited for it.
- `dag[].carryover` is an optional boolean written only by the planner during a version bump: the node's spec is materially unchanged from the previous version. Omitted or `false` means the node is new or rewritten. The full marking criteria are in [workflow-rules.md](workflow-rules.md). A version-2 dag with one inherited node:

  ```yaml
  # version: 2 — s1 rewritten, s2 inherited unchanged
  dag:
    - {id: s1, task: "tasks/01_extract_validator.yaml", depends_on: []}
    - {id: s2, task: "tasks/02_replace_callers.yaml", depends_on: [s1], carryover: true}
  ```
- `trust: checked` requires an `assertion` whose `replay` is a command or unambiguous symbol lookup that can be executed verbatim; the planner must have actually run it once before marking checked — otherwise mark unverified. `trust: unverified` requires `by` (source), and constraints additionally require `rederive_cost` (low/medium/high; decisions are exempt — a judgment call has no re-derivation cost); cross-check before use.
- One-line anti-regression exclusions go in `excluded`; detailed pitfalls go in the ledger (entries with `verdict: excluded`). L0 never carries long-form records.
- `excluded` is a plan-scope constraint: modifying an excluded item is a plan-invalidation event, and a local invalidation never auto-voids the rest of the plan. Detection, recording, and revision of the event are defined in [workflow-rules.md](workflow-rules.md).

## L1 Task Card

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

- One card per DAG node, filename `NN_action_summary.yaml`, NN matching the `dag[].id` number. L0's dag is the authoritative topology; the card's `depends_on` is a self-contained copy that must equal L0's.
- Keep each card within 1K tokens. Exceeding it means the card mixed in another node's content or ledger details.
- `cites` references only entry IDs that already exist in ledger.jsonl — never copies entry content, never quotes source. The executor looks up the locator by ID in the ledger, then reads the source at that location.
- `acceptance` holds this node's verifiable assertions, complementary to L0's global acceptance, and must not be empty.
- Task cards freeze together with L0 (freeze and version-bump rules: [workflow-rules.md](workflow-rules.md)).

## L2 ledger.jsonl

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

## L3 handoff/NN_to_MM.md

File structure of one handoff; whether and when it is written (the executor's optional, recommended choice) and the all-three-mandatory contract are defined in [workflow-rules.md](workflow-rules.md). The three sections:

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

## views/ (compiled output)

- `plan.view.md`: the human review view rendered from plan.yaml + tasks/, containing goal, constraints, DAG table (static topology with carryover marks, never execution state), per-card summaries, exclusions. This is what goes to the user for approval, not raw YAML. Its only reader is the human approver.
- `review.packet.md`: the review isolation view containing exactly four things — the original request, the diff, full before/after content of every changed file, and the acceptance criteria. Compiled at review handoff, never hand-edited; contains no plan.yaml, task cards, excluded, ledger, or handoff.
- The entire views/ directory is deletable and rebuildable; on conflict, L0–L3 win.
