# Semantic Invariants

Spec version: 0-draft. JSON Schema covers structural constraints; the rules below cannot be
expressed in a schema and are enforced by `plan-dossier validate`. Numbering matches the
SKILL.md Verification Checklist where applicable.

## Errors

1. **DAG file existence**: every `dag[].task` path resolves to a file under the dossier.
2. **DAG reference integrity**: every `depends_on` id exists as a `dag[].id`; the dependency
   graph is acyclic.
3. **Card/DAG correspondence**: each task card `id` matches a `dag` node whose `task` points at
   that card; no duplicate card ids; no dag node without its card file.
4. **Cites resolution**: every task-card `cites` id resolves to an entry in ledger.jsonl.
5. **Ledger line validity**: every ledger.jsonl line is valid JSON conforming to
   ledger.schema.json; `id` is unique; `supersedes` (when set) points at an earlier entry's id.
6. **Mitigation anchors**: every `risks[].mitigated_by` anchor resolves — `aN` to the Nth entry
   of L0 `acceptance`, `sM.N` to the Nth `acceptance` entry of task card `sM`.
7. **Trust grading**: `trust: checked` entries carry `assertion.replay`; `trust: unverified`
   entries carry `by`, and constraints additionally carry `rederive_cost` (decisions omit it —
   the SKILL.md L0 example does).

## Warns (heuristics, never blocking)

8. **Token budget**: plan.yaml estimated ≤ 2K tokens, each task card ≤ 1K (chars/4 heuristic).
9. **Empty exclusions explained**: when `excluded` is `[]`, `open_questions` should note
   "no exclusions made".
10. **Review isolation**: review.packet.md contains no ledger ids (`L-<digits>`) and no excluded
    locator strings.
11. **Render consistency**: the DAG status shown in views/plan.view.md matches plan.yaml.
