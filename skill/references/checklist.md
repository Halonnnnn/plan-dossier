# Delivery Verification

The pre-delivery verification checklist plus common mistakes. Items are explicitly graded into three categories to prevent self-declared passes on what cannot be mechanically verified. Item numbering is referenced by the repo's semantic-invariant spec — do not renumber.

## Verification Checklist

### Blocking Hard Gates

Must be 100% objectively verified before delivery; fix anything that fails first:

1. Reference integrity: after scanning every task card's `cites`, every ID resolves to a line in ledger.jsonl; every `dag[].task` file exists; every `risks[].mitigated_by` anchor (`aN`, `sM.N`) resolves to an entry in L0 acceptance or the corresponding task card.
2. Trust grading completeness: every `trust: checked` entry has an `assertion`; every `trust: unverified` entry has `by`, and constraints additionally have `rederive_cost`.
3. `excluded` and `gaps` fields exist; when empty they are `[]`, and an empty `excluded` is explained in `open_questions`.
4. Budget handling: token estimates computed for plan.yaml and each task card; any overflow beyond the default targets (2K / 1K) has been reported to the user with sink/compress/keep options; packet, when compiled, ≤ 4K and ends with the unselected-entries listing.
5. Separation of duties: plan.yaml contains no search-process detail (that is the ledger's job) and no source quotations; task cards contain no copied ledger content or source.
6. Review isolation (when review.packet.md is compiled): contains no verbatim objective from plan.yaml, no excluded entries, no ledger IDs.
7. Render consistency (when rendered): views/plan.view.md is rendered from the currently frozen L0 + L1, with every DAG node id present.

### Post-Execution Diagnostics

Never blocks plan delivery by default; item 8 is a conditional gate — it blocks whenever handoff files exist and is not applicable otherwise:

8. Handoff format gate: when any `handoff/*.md` exists, all three sections are present — mechanically enforced by the CLI whenever they exist. Absence of handoffs is not a defect; write-back is optional.

### Human Visual Check

Requires human confirmation; the model must not declare pass on its own:

9. Single source: across L0 and all task cards, the same data list (key list, whitelist, enum) is expanded in exactly one place; everywhere else it is referenced by anchor or ID.

## Common Mistakes

Mistakes not already covered by a rule above — each restates a failure mode the rules do not name:

- **Writing L0 as a long prose document.** It is re-paid by every role at every handoff, mostly with content irrelevant to the current role.
- **Omitting exclusions.** Writing "how" without "why not the other way" is the number one cause of executors regressing when they hit resistance.
- **Replacing handoffs with checkboxes.** Resuming needs real output paths and deviation records; `[x]` cannot carry context into a new session.
- **Giving the reviewer the plan or exclusions.** It destroys review independence; exclusions also tempt the reviewer to skip regions.
